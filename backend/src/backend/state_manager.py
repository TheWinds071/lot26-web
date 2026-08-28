import asyncio
import logging
import uuid
from collections import deque
from datetime import datetime
from typing import Callable, Deque, List, Optional, Set

from backend.models import (
    AlarmEvent,
    DeviceState,
    SystemStatus,
    TelemetryData,
    ThresholdConfig,
)

logger = logging.getLogger("state_manager")


class StateManager:
    """Manages telemetry history, device control state, alarms, and auto-control logic."""

    def __init__(self, history_limit: int = 300, alarm_limit: int = 100):
        self.history_limit = history_limit
        self.alarm_limit = alarm_limit

        self.latest_telemetry: Optional[TelemetryData] = None
        self.telemetry_history: Deque[TelemetryData] = deque(maxlen=history_limit)
        self.alarms: Deque[AlarmEvent] = deque(maxlen=alarm_limit)

        self.device_state = DeviceState(
            auto_mode=True,
            pump_active=True,
            pump_speed=60,
            heater_active=False,
            heater_power=0,
            emergency_stop=False,
        )

        self.thresholds = ThresholdConfig()
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
        logger.warning(f"[ALARM] [{level}] {actual_type}: {message}")
        self._notify("alarm", alarm.model_dump(mode="json"))
        return alarm

    def resolve_alarm(self, alarm_type: str) -> None:
        for alarm in self.alarms:
            if alarm.type == alarm_type and not alarm.resolved:
                alarm.resolved = True
                self._notify("alarm_resolved", {"type": alarm_type, "id": alarm.id})

    def process_telemetry(self, telemetry: TelemetryData) -> dict:
        """Ingests new telemetry data, runs auto-control rule engine, returns control decisions."""
        self.latest_telemetry = telemetry
        self.telemetry_history.append(telemetry)
        self.last_packet_time = datetime.now()
        self.tcp_client_connected = True

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
        """Evaluates auto control rules and safety boundaries."""
        action_taken = False

        if self.device_state.emergency_stop:
            if self.device_state.pump_active or self.device_state.heater_active:
                self.device_state.pump_active = False
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
            return action_taken

        # 1. Pressure Safety Check
        if telemetry.pressure >= self.thresholds.pressure_max:
            self.add_alarm(
                level="CRITICAL",
                type="OVERPRESSURE",
                message=f"管道压力超限: {telemetry.pressure:.2f} MPa (上限 {self.thresholds.pressure_max:.2f} MPa)",
                value=telemetry.pressure,
            )
            # Pressure safety action: stop or throttle pump
            if self.device_state.auto_mode and self.device_state.pump_active:
                self.device_state.pump_active = False
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
        else:
            self.resolve_alarm("OVERPRESSURE")

        # 2. Temperature Safety & Heating Control
        if telemetry.temperature >= self.thresholds.temp_max:
            self.add_alarm(
                level="ERROR",
                type="TEMP_HIGH",
                message=f"水温过高: {telemetry.temperature:.1f} °C (最高阈值 {self.thresholds.temp_max:.1f} °C)",
                value=telemetry.temperature,
            )
            if self.device_state.heater_active:
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
        else:
            self.resolve_alarm("TEMP_HIGH")

        # 3. Flow Rate / Dry-run Safety Check
        if self.device_state.pump_active and telemetry.flow_rate < self.thresholds.flow_rate_min:
            self.add_alarm(
                level="WARNING",
                type="LOW_FLOW",
                message=f"水流过低/防干烧预警: {telemetry.flow_rate:.1f} L/min (下限 {self.thresholds.flow_rate_min:.1f} L/min)",
                value=telemetry.flow_rate,
            )
            # In severe dry-run condition, heating must be turned off to avoid damage
            if self.device_state.heater_active:
                self.device_state.heater_active = False
                self.device_state.heater_power = 0
                self.device_state.last_updated = datetime.now()
                action_taken = True
        else:
            self.resolve_alarm("LOW_FLOW")

        # 4. Auto Control Logic (Heating & Circulation)
        if self.device_state.auto_mode and not self.device_state.emergency_stop:
            # Automatic Temperature Regulation
            if telemetry.temperature <= self.thresholds.temp_min:
                # Water is too cold, engage heater and ensure pump is running for circulation
                if not self.device_state.heater_active or not self.device_state.pump_active:
                    self.device_state.pump_active = True
                    self.device_state.heater_active = True
                    self.device_state.heater_power = 100
                    self.device_state.last_updated = datetime.now()
                    action_taken = True
                    logger.info(f"[Auto Control] Low Temp ({telemetry.temperature:.1f}°C <= {self.thresholds.temp_min}°C) -> Started Heater & Pump")
            elif telemetry.temperature >= self.thresholds.temp_target:
                # Target temperature reached, turn off heater
                if self.device_state.heater_active:
                    self.device_state.heater_active = False
                    self.device_state.heater_power = 0
                    self.device_state.last_updated = datetime.now()
                    action_taken = True
                    logger.info(f"[Auto Control] Target Temp Reached ({telemetry.temperature:.1f}°C >= {self.thresholds.temp_target}°C) -> Stopped Heater")

            # Automatic Pump Flow Control
            if not self.device_state.pump_active and telemetry.temperature > self.thresholds.temp_min:
                # Maintain basic circulation
                self.device_state.pump_active = True
                self.device_state.last_updated = datetime.now()
                action_taken = True

        return action_taken

    def update_thresholds(self, config: ThresholdConfig) -> ThresholdConfig:
        self.thresholds = config
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
                message="紧急急停按钮已被按下！所有执行器已强制关闭。",
            )
        else:
            self.resolve_alarm("EMERGENCY_STOP")
        self.device_state.last_updated = datetime.now()
        self._notify("device_state_updated", self.device_state.model_dump(mode="json"))
        return self.device_state

    def control_pump(self, active: bool, speed: Optional[int] = None) -> DeviceState:
        if self.device_state.emergency_stop and active:
            raise ValueError("紧急急停状态下无法启动水泵！请先解除急停。")
        self.device_state.pump_active = active
        if speed is not None:
            self.device_state.pump_speed = max(0, min(100, speed))
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

    def get_alarms(self, limit: int = 50) -> List[AlarmEvent]:
        return list(self.alarms)[:limit]

    def clear_alarms(self) -> None:
        self.alarms.clear()
        self._notify("alarms_cleared", {})


# Global singleton instance
state_manager = StateManager()
