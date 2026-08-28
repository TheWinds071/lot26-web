from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class TelemetryData(BaseModel):
    """Sensor Telemetry Data received from TCP Client"""
    device_id: str = Field(default="PUMP_STATION_01", description="Device ID")
    temperature: float = Field(..., description="Water Temperature in Celsius (°C)")
    pressure: float = Field(..., description="Pipe Pressure in MPa")
    flow_rate: float = Field(..., description="Pipe Flow Rate in L/min")
    timestamp: datetime = Field(default_factory=datetime.now, description="Timestamp")


class DeviceState(BaseModel):
    """Device Actuator and Running State"""
    auto_mode: bool = Field(default=True, description="Auto control mode enabled")
    pump_active: bool = Field(default=True, description="Water pump running state")
    pump_speed: int = Field(default=60, ge=0, le=100, description="Pump speed percentage (0-100%)")
    heater_active: bool = Field(default=False, description="Heating module running state")
    heater_power: int = Field(default=0, ge=0, le=100, description="Heater power percentage (0-100%)")
    emergency_stop: bool = Field(default=False, description="Emergency stop triggered")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")


class ThresholdConfig(BaseModel):
    """Automatic Control Threshold Rules"""
    # Temperature rules (°C)
    temp_target: float = Field(default=55.0, description="Target water temperature (°C)")
    temp_min: float = Field(default=45.0, description="Minimum water temperature threshold to turn on heater (°C)")
    temp_max: float = Field(default=75.0, description="Maximum water temperature threshold to turn off heater/alarm (°C)")
    
    # Pressure rules (MPa)
    pressure_min: float = Field(default=0.10, description="Minimum pipe pressure threshold (MPa)")
    pressure_max: float = Field(default=0.80, description="Maximum pipe pressure safe threshold (MPa)")
    
    # Flow rate rules (L/min)
    flow_rate_min: float = Field(default=5.0, description="Minimum flow rate threshold to prevent dry-run (L/min)")
    flow_rate_target: float = Field(default=25.0, description="Target flow rate (L/min)")


class AlarmEvent(BaseModel):
    """Alarm and Alert Log Item"""
    id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    level: str = Field(..., description="INFO, WARNING, ERROR, CRITICAL")
    type: str = Field(..., description="TEMP_HIGH, TEMP_LOW, OVERPRESSURE, LOW_FLOW, DRY_RUN, COMM_TIMEOUT")
    message: str
    value: Optional[float] = None
    resolved: bool = False


class SystemStatus(BaseModel):
    """Comprehensive System Status for Frontend Dashboard"""
    telemetry: Optional[TelemetryData] = None
    device_state: DeviceState
    thresholds: ThresholdConfig
    active_alarms: List[AlarmEvent] = []
    tcp_client_connected: bool = False
    last_packet_time: Optional[datetime] = None
