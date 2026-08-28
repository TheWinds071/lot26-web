export interface TelemetryData {
  device_id: string;
  temperature: number;
  pressure: number;
  flow_rate: number;
  timestamp: string;
}

export interface DeviceState {
  auto_mode: boolean;
  pump_active: boolean;
  pump_speed: number;
  heater_active: boolean;
  heater_power: number;
  emergency_stop: boolean;
  last_updated: string;
}

export interface ThresholdConfig {
  temp_target: number;
  temp_min: number;
  temp_max: number;
  pressure_min: number;
  pressure_max: number;
  flow_rate_min: number;
  flow_rate_target: number;
}

export interface AlarmEvent {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  type: string;
  message: string;
  value?: number;
  resolved: boolean;
}

export interface SystemStatus {
  telemetry?: TelemetryData;
  device_state: DeviceState;
  thresholds: ThresholdConfig;
  active_alarms: AlarmEvent[];
  tcp_client_connected: boolean;
  last_packet_time?: string;
}
