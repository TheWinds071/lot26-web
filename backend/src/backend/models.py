import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class TelemetryData(BaseModel):
    """Sensor Telemetry Data received from TCP Client for Single-Pipe Dual-Tank System"""
    device_id: str = Field(default="DUAL_TANK_STATION_01", description="Device ID")
    temp_tank1: float = Field(..., description="Tank 1 Water Temperature in Celsius (°C)")
    temp_tank2: float = Field(..., description="Tank 2 Water Temperature in Celsius (°C)")
    temperature: Optional[float] = Field(default=None, description="Average/Primary water temperature (°C)")
    pressure: float = Field(..., description="Single Pipe Pressure in Pa")
    flow_rate: float = Field(..., description="Single Pipe Flow Rate in L/min")
    total_volume: Optional[float] = Field(default=0.0, description="Accumulated pipe flow volume in liters (L)")
    water_level_tank1: Optional[float] = Field(default=75.0, description="Tank 1 Water Level (%)")
    water_level_tank2: Optional[float] = Field(default=65.0, description="Tank 2 Water Level (%)")
    timestamp: datetime = Field(default_factory=datetime.now, description="Timestamp")

    def model_post_init(self, __context):
        if self.temperature is None:
            self.temperature = round((self.temp_tank1 + self.temp_tank2) / 2.0, 2)


class DeviceState(BaseModel):
    """Device Actuator and Running State"""
    auto_mode: bool = Field(default=False, description="Auto control mode enabled")
    pump_active: bool = Field(default=False, description="Water pump running state")
    pump_direction: str = Field(
        default="FORWARD",
        description="Pump flow direction: 'FORWARD' (Tank 1 -> Tank 2) or 'REVERSE' (Tank 2 -> Tank 1)",
    )
    pump_speed: int = Field(default=60, ge=0, le=100, description="Pump speed percentage (0-100%)")
    heater_active: bool = Field(default=False, description="Heating module running state")
    heater_power: int = Field(default=0, ge=0, le=100, description="Heater power percentage (0-100%)")
    accumulated_volume: float = Field(default=0.0, description="Current batch/session accumulated water volume in liters (L)")
    target_volume_reached: bool = Field(default=False, description="Flag indicating target batch volume has been reached and pump stopped")
    emergency_stop: bool = Field(default=False, description="Emergency stop triggered")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")


class ThresholdConfig(BaseModel):
    """Automatic Control Threshold Rules for Single-Pipe Dual Tank System"""
    # Temperature rules (°C)
    temp_target: float = Field(default=55.0, description="Target water temperature (°C)")
    temp_min: float = Field(default=45.0, description="Minimum water temperature threshold to turn on heater (°C)")
    temp_max: float = Field(default=75.0, description="Maximum water temperature threshold to turn off heater/alarm (°C)")
    temp_diff_max: float = Field(default=15.0, description="Maximum temperature differential between Tank 1 & Tank 2 (°C)")

    # Pressure rules (Pa)
    pressure_min: float = Field(default=10000.0, description="Minimum pipe pressure threshold (Pa)")
    pressure_max: float = Field(default=800000.0, description="Maximum pipe pressure safe threshold (Pa)")

    # Flow rate rules (L/min) - Default adapted to micro-flow (0 ~ 0.4 L/min)
    flow_rate_min: float = Field(default=0.05, description="Minimum flow rate threshold to prevent dry-run (L/min)")
    flow_rate_target: float = Field(default=0.30, description="Target flow rate (L/min)")

    # Volume / Batching rules (Liters)
    target_volume: float = Field(default=10.0, description="Target batch water volume threshold in liters (L)")
    volume_control_enabled: bool = Field(default=True, description="Enable automatic pump stop when target volume is reached")


class AlarmEvent(BaseModel):
    """Alarm and Alert Log Item"""
    id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    level: str = Field(..., description="INFO, WARNING, ERROR, CRITICAL")
    type: str = Field(..., description="TEMP_HIGH, TEMP_DIFF, OVERPRESSURE, LOW_FLOW, DRY_RUN, COMM_TIMEOUT, EMERGENCY_STOP")
    message: str
    value: Optional[float] = None
    resolved: bool = False


class AlarmRule(BaseModel):
    """Configurable Alarm Rule for SCADA telemetry monitoring"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="Unique Rule ID")
    name: str = Field(..., description="Alarm rule name, e.g. 水槽1水温过高报警")
    metric: str = Field(
        ...,
        description="Metric field name: temp_tank1, temp_tank2, temperature, temp_diff, pressure, flow_rate, accumulated_volume, water_level_tank1, water_level_tank2, water_level_diff",
    )
    operator: str = Field(
        ...,
        description="Comparison operator: '>', '>=', '<', '<=', '==', '!='",
    )
    threshold: float = Field(..., description="Numerical threshold value")
    level: str = Field(
        default="WARNING",
        description="Severity level: INFO, WARNING, ERROR, CRITICAL",
    )
    message: Optional[str] = Field(
        default=None,
        description="Custom message template or description",
    )
    action: str = Field(
        default="NONE",
        description="Safety action: NONE, STOP_HEATER, STOP_PUMP, EMERGENCY_STOP",
    )
    enabled: bool = Field(default=True, description="Rule enable/disable switch")
    is_system: bool = Field(default=False, description="Whether this is a built-in default rule")
    created_at: datetime = Field(default_factory=datetime.now, description="Rule creation time")


class SystemStatus(BaseModel):
    """Comprehensive System Status for Single-Pipe Dual-Tank SCADA Dashboard"""
    telemetry: Optional[TelemetryData] = None
    device_state: DeviceState
    thresholds: ThresholdConfig
    active_alarms: List[AlarmEvent] = []
    alarm_rules: List[AlarmRule] = []
    tcp_client_connected: bool = False
    last_packet_time: Optional[datetime] = None
