import asyncio
import json
import logging
import uuid
from collections import deque
from datetime import datetime
from typing import Callable, Deque, List, Optional, Set

from backend.database import DatabaseManager, db_manager
from backend.models import (
    AlarmEvent,
    DeviceState,
    SystemStatus,
    TelemetryData,
    ThresholdConfig,
)

logger = logging.getLogger("state_manager")


class StateManager:
    """Manages single-pipe dual-tank telemetry, bidirectional pump state, alarms, auto-control logic, and SQLite persistence."""

    def __init__(self, history_limit: int = 300, alarm_limit: int = 100, db: Optional[DatabaseManager] = None):
        self.history_limit = history_limit
        self.alarm_limit = alarm_limit
        self.db: DatabaseManager = db or db_manager

        self.latest_telemetry: Optional[TelemetryData] = None
        self.telemetry_history: Deque[TelemetryData] = deque(maxlen=history_limit)
        self.alarms: Deque[AlarmEvent] = deque(maxlen=alarm_limit)

        # Preload recent historical data from SQLite into in-memory ring buffer
        try:
            persisted_records = self.db.get_recent_telemetry(limit=history_limit)
            if persisted_records:
                self.telemetry_history.extend(persisted_records)
                self.latest_telemetry = persisted_records[-1]
                logger.info(f"Loaded {len(persisted_records)} historical telemetry records from SQLite.")

            persisted_alarms = self.db.get_alarm_history(limit=alarm_limit)
            if persisted_alarms:
                self.alarms.extend(persisted_alarms)
        except Exception as e:
            logger.warning(f"Failed to preload SQLite historical records: {e}")

        self.device_state = DeviceState(
            auto_mode=False,
            pump_active=False,
            pump_direction="FORWARD",  # "FORWARD": Tank 1 -> Tank 2, "REVERSE": Tank 2 -> Tank 1
            pump_speed=60,
            heater_active=False,
            heater_power=0,
            emergency_stop=False,
        )

        self.thresholds = self._load_thresholds()
        self.tcp_client_connected = False
        self.last_packet_time: Optional[datetime] = None

        # Listeners for real-time websocket broadcast
        self._listeners: Set[Callable[[dict], None]] = set()

    def subscribe(self, callback: Callable[[dict], None]) -> None:
        self._listeners.add(callback)

    def unsubscribe(self, callback: Callable[[dict], None]) -> None:
        self._listeners.discard(callback)

    def _notify(self, event_type: str, data: dict) -> None:
        payload = {
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "data": data,
        }
        for cb in list(self._listeners):
            try:
                cb(payload)
            except Exception as e:
                logger.error(f"Error dispatching state event: {e}")

    def add_alarm(
        self,
        level: str,
        type: str = "",
        message: str = "",
        value: Optional[float] = None,
        alarm_type: Optional[str] = None,
    ) -> AlarmEvent:
        actual_type = alarm_type or type
        # Check if identical active alarm exists to avoid spamming
        for existing in self.alarms:
            if existing.type == actual_type and not existing.resolved:
                existing.message = message
                existing.value = value
                existing.timestamp = datetime.now()
                try:
                    self.db.insert_or_update_alarm(existing)
                except Exception as e:
                    logger.error(f"Error persisting updated alarm to SQLite: {e}")
                return existing

        alarm = AlarmEvent(
            id=str(uuid.uuid4())[:8],
            timestamp=datetime.now(),
            level=level,
            type=actual_type,
            message=message,
            value=value,
            resolved=False,
        )
        self.alarms.appendleft(alarm)
        try:
            self.db.insert_or_update_alarm(alarm)
        except Exception as e:
            logger.error(f"Error persisting new alarm to SQLite: {e}")

        logger.warning(f"[ALARM] [{level}] {actual_type}: {message}")
        self._notify("alarm", alarm.model_dump(mode="json"))
        return alarm

    def resolve_alarm(self, alarm_type: str) -> None:
        for alarm in self.alarms:
            if alarm.type == alarm_type and not alarm.resolved:
                alarm.resolved = True
                self._notify("alarm_resolved", {"type": alarm_type, "id": alarm.id})
        try:
            self.db.resolve_alarm(alarm_type)
        except Exception as e:
            logger.error(f"Error resolving alarm in SQLite: {e}")

    def process_telemetry(self, telemetry: TelemetryData) -> dict:
        """Ingests new dual-tank telemetry, records to SQLite, runs auto-control rule engine, returns control decisions."""
        self.latest_telemetry = telemetry
        self.telemetry_history.append(telemetry)
        self.last_packet_time = datetime.now()
        self.tcp_client_connected = True

        # Persist to SQLite
        try:
            self.db.insert_telemetry(telemetry)
        except Exception as e:
            logger.error(f"Failed to record telemetry to SQLite: {e}")

        # Run auto-control rule engine if auto mode is on and not emergency stopped
        control_action_taken = self._evaluate_rules(telemetry)

        # Notify subscribers (WebSockets)
        status_dump = self.get_system_status().model_dump(mode="json")
        self._notify("telemetry", {
            "telemetry": telemetry.model_dump(mode="json"),
            "device_state": self.device_state.model_dump(mode="json"),
            "status": status_dump,
        })

        return {
            "control_action_taken": control_action_taken,
            "device_state": self.device_state.model_dump(mode="json"),
        }

    def _evaluate_rules(self, telemetry: TelemetryData) -> bool:
        """Evaluates single-pipe bidirectional auto control rules and safety boundaries."""
        action_taken = False

        if self.device_state.emergency_stop:
            if self.device_state.pump_active or self.device_state.heater_active:
                self.device_state.pump_active = False
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
            return action_taken

        # 1. Single Pipe Pressure Safety Check (Pa)
        effective_pressure_max = (
            self.thresholds.pressure_max * 1_000_000.0
            if self.thresholds.pressure_max < 10.0
            else self.thresholds.pressure_max
        )
        if telemetry.pressure >= effective_pressure_max:
            self.add_alarm(
                level="CRITICAL",
                type="OVERPRESSURE",
                message=f"单管道压力超限: {telemetry.pressure:.0f} Pa (上限 {effective_pressure_max:.0f} Pa)",
                value=telemetry.pressure,
            )
            # Pressure safety action: stop heater immediately
            if self.device_state.heater_active:
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
        else:
            self.resolve_alarm("OVERPRESSURE")

        # 2. Dual-Tank Temperature Safety Check
        max_current_temp = max(telemetry.temp_tank1, telemetry.temp_tank2)
        min_current_temp = min(telemetry.temp_tank1, telemetry.temp_tank2)
        temp_diff = abs(telemetry.temp_tank1 - telemetry.temp_tank2)

        if max_current_temp >= self.thresholds.temp_max:
            tank_label = "水槽1" if telemetry.temp_tank1 >= self.thresholds.temp_max else "水槽2"
            self.add_alarm(
                level="ERROR",
                type="TEMP_HIGH",
                message=f"{tank_label}水温超高: {max_current_temp:.1f} °C (上限 {self.thresholds.temp_max:.1f} °C)",
                value=max_current_temp,
            )
            if self.device_state.heater_active:
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
        else:
            self.resolve_alarm("TEMP_HIGH")

        # Temperature differential alert between the two tanks
        if temp_diff >= self.thresholds.temp_diff_max:
            self.add_alarm(
                level="WARNING",
                type="TEMP_DIFF",
                message=f"双水槽温差过大: {temp_diff:.1f} °C (水槽1: {telemetry.temp_tank1:.1f}°C, 水槽2: {telemetry.temp_tank2:.1f}°C, 阈值 {self.thresholds.temp_diff_max:.1f}°C)",
                value=temp_diff,
            )
        else:
            self.resolve_alarm("TEMP_DIFF")

        # 3. Flow Rate / Dry-run Safety Check (自适应微流量 0~0.4 L/min)
        effective_flow_min = (
            0.02
            if (self.thresholds.flow_rate_min > 1.0 and telemetry.flow_rate <= 1.0)
            else self.thresholds.flow_rate_min
        )
        if self.device_state.pump_active and telemetry.flow_rate < effective_flow_min:
            self.add_alarm(
                level="WARNING",
                type="LOW_FLOW",
                message=f"管道流速过低/防干烧: {telemetry.flow_rate:.2f} L/min (下限 {effective_flow_min:.2f} L/min)",
                value=telemetry.flow_rate,
            )
            if self.device_state.heater_active:
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
        else:
            self.resolve_alarm("LOW_FLOW")

        # 4. Auto Control Logic (Temperature Only - Water pump is manually controlled)
        if self.device_state.auto_mode and not self.device_state.emergency_stop:
            avg_temp = (telemetry.temp_tank1 + telemetry.temp_tank2) / 2.0

            # Low Temperature Heating Trigger
            if min_current_temp <= self.thresholds.temp_min or avg_temp <= self.thresholds.temp_min:
                if not self.device_state.heater_active:
                    self.device_state.heater_active = True
                    self.device_state.heater_power = 100
                    self.device_state.last_updated = datetime.now()
                    action_taken = True
                    logger.info(
                        f"[Auto Control] Low Temp (T1={telemetry.temp_tank1:.1f}°C, T2={telemetry.temp_tank2:.1f}°C <= {self.thresholds.temp_min:.1f}°C) -> Started Heater"
                    )
            elif avg_temp >= self.thresholds.temp_target:
                # Target temperature reached in both tanks, turn off heater
                if self.device_state.heater_active:
                    self.device_state.heater_active = False
                    self.device_state.heater_power = 0
                    self.device_state.last_updated = datetime.now()
                    action_taken = True
                    logger.info(
                        f"[Auto Control] Target Temp Reached (Avg={avg_temp:.1f}°C >= {self.thresholds.temp_target:.1f}°C) -> Stopped Heater"
                    )

        return action_taken

    def _load_thresholds(self) -> ThresholdConfig:
        """Loads persisted thresholds from SQLite database if available, else uses defaults."""
        try:
            val = self.db.get_config("thresholds")
            if val:
                data = json.loads(val)
                loaded = ThresholdConfig(**data)
                logger.info(f"[StateManager] Loaded persistent thresholds from SQLite: {loaded.model_dump()}")
                return loaded
        except Exception as e:
            logger.error(f"[StateManager] Failed to load persistent thresholds: {e}")
        return ThresholdConfig()

    def update_thresholds(self, config: ThresholdConfig) -> ThresholdConfig:
        self.thresholds = config
        try:
            self.db.set_config("thresholds", self.thresholds.model_dump_json())
            logger.info("[StateManager] Persisted updated thresholds to SQLite.")
        except Exception as e:
            logger.error(f"[StateManager] Failed to persist thresholds to SQLite: {e}")
        self._notify("thresholds_updated", self.thresholds.model_dump(mode="json"))
        return self.thresholds

    def set_auto_mode(self, auto_mode: bool) -> DeviceState:
        self.device_state.auto_mode = auto_mode
        self.device_state.last_updated = datetime.now()
        self._notify("mode_changed", {"auto_mode": auto_mode})
        return self.device_state

    def set_emergency_stop(self, emergency_stop: bool) -> DeviceState:
        self.device_state.emergency_stop = emergency_stop
        if emergency_stop:
            self.device_state.pump_active = False
            self.device_state.heater_active = False
            self.device_state.heater_power = 0
            self.add_alarm(
                level="CRITICAL",
                type="EMERGENCY_STOP",
                message="紧急急停按钮已被按下！所有水泵与加热器已强制锁定关闭。",
            )
        else:
            self.resolve_alarm("EMERGENCY_STOP")
        self.device_state.last_updated = datetime.now()
        self._notify("device_state_updated", self.device_state.model_dump(mode="json"))
        return self.device_state

    def control_pump(
        self,
        active: bool,
        speed: Optional[int] = None,
        direction: Optional[str] = None,
    ) -> DeviceState:
        if self.device_state.emergency_stop and active:
            raise ValueError("紧急急停状态下无法启动水泵！请先解除急停。")
        self.device_state.pump_active = active
        if speed is not None:
            self.device_state.pump_speed = max(0, min(100, speed))
        if direction in ("FORWARD", "REVERSE"):
            self.device_state.pump_direction = direction
        self.device_state.last_updated = datetime.now()
        self._notify("device_state_updated", self.device_state.model_dump(mode="json"))
        return self.device_state

    def control_heater(self, active: bool, power: Optional[int] = None) -> DeviceState:
        if self.device_state.emergency_stop and active:
            raise ValueError("紧急急停状态下无法启动加热模块！请先解除急停。")
        self.device_state.heater_active = active
        if power is not None:
            self.device_state.heater_power = max(0, min(100, power))
        elif active and self.device_state.heater_power == 0:
            self.device_state.heater_power = 100
        elif not active:
            self.device_state.heater_power = 0
        self.device_state.last_updated = datetime.now()
        self._notify("device_state_updated", self.device_state.model_dump(mode="json"))
        return self.device_state

    def get_system_status(self) -> SystemStatus:
        active_alarms = [a for a in self.alarms if not a.resolved]
        return SystemStatus(
            telemetry=self.latest_telemetry,
            device_state=self.device_state,
            thresholds=self.thresholds,
            active_alarms=active_alarms,
            tcp_client_connected=self.tcp_client_connected,
            last_packet_time=self.last_packet_time,
        )

    def get_history(self, limit: int = 100) -> List[TelemetryData]:
        items = list(self.telemetry_history)
        return items[-limit:]

    def query_history(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        order: str = "DESC",
    ) -> List[TelemetryData]:
        """Queries persistent history from SQLite with optional time range and pagination."""
        return self.db.query_telemetry(
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset,
            order=order,
        )

    def get_history_stats(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> dict:
        """Returns statistical aggregations from SQLite history."""
        return self.db.get_telemetry_stats(start_time=start_time, end_time=end_time)

    def get_history_count(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> int:
        """Returns total count of persistent records from SQLite."""
        return self.db.get_telemetry_count(start_time=start_time, end_time=end_time)

    def export_history_csv(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 5000,
    ) -> str:
        """Exports historical telemetry to CSV format."""
        return self.db.export_telemetry_csv(
            start_time=start_time,
            end_time=end_time,
            limit=limit,
        )

    def get_alarms(self, limit: int = 50) -> List[AlarmEvent]:
        return list(self.alarms)[:limit]

    def clear_alarms(self) -> None:
        self.alarms.clear()
        self._notify("alarms_cleared", {})

    def clear_history(self) -> int:
        """Clears all historical telemetry records from SQLite and in-memory ring buffer."""
        deleted = self.db.clear_telemetry_history()
        self.telemetry_history.clear()
        self.latest_telemetry = None
        self._notify("history_cleared", {"deleted": deleted})
        logger.info(f"[StateManager] Cleared historical telemetry ({deleted} records from SQLite).")
        return deleted


# Global singleton instance
state_manager = StateManager()

