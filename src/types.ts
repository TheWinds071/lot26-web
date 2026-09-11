export interface TelemetryData {
  device_id: string;
  temp_tank1: number;
  temp_tank2: number;
  temperature: number;
  pressure: number; // 单管路水流压力 (Pa)
  flow_rate: number;
  water_level_tank1?: number;
  water_level_tank2?: number;
  timestamp: string;
}

export interface DeviceState {
  auto_mode: boolean;
  pump_active: boolean;
  pump_direction: 'FORWARD' | 'REVERSE';
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
  temp_diff_max: number;
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

export type MetricType =
  | 'temp_tank1'
  | 'temp_tank2'
  | 'temperature'
  | 'temp_diff'
  | 'pressure'
  | 'flow_rate'
  | 'water_level_tank1'
  | 'water_level_tank2'
  | 'water_level_diff';

export type OperatorType = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type AlarmLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type RuleAction = 'NONE' | 'STOP_HEATER' | 'STOP_PUMP' | 'EMERGENCY_STOP';

export interface AlarmRule {
  id: string;
  name: string;
  metric: MetricType;
  operator: OperatorType;
  threshold: number;
  level: AlarmLevel;
  message?: string;
  action: RuleAction;
  enabled: boolean;
  is_system?: boolean;
  created_at?: string;
}

export interface MetricDefinition {
  value: MetricType;
  label: string;
  unit: string;
  defaultThreshold: number;
  step: number;
  description: string;
}

export const METRIC_DEFINITIONS: Record<MetricType, MetricDefinition> = {
  temp_tank1: {
    value: 'temp_tank1',
    label: '水槽1水温',
    unit: '°C',
    defaultThreshold: 75,
    step: 0.5,
    description: '主供水槽1实际温度',
  },
  temp_tank2: {
    value: 'temp_tank2',
    label: '水槽2水温 (加热槽)',
    unit: '°C',
    defaultThreshold: 75,
    step: 0.5,
    description: '工艺受水与加热模块所在水槽2温度',
  },
  temperature: {
    value: 'temperature',
    label: '平均水温',
    unit: '°C',
    defaultThreshold: 65,
    step: 0.5,
    description: '双水槽水温综合平均值',
  },
  temp_diff: {
    value: 'temp_diff',
    label: '双水槽温差',
    unit: '°C',
    defaultThreshold: 15,
    step: 0.5,
    description: '水槽1与水槽2之间的绝对温差',
  },
  pressure: {
    value: 'pressure',
    label: '单管道水压',
    unit: 'Pa',
    defaultThreshold: 800000,
    step: 1000,
    description: '单管道循环输送实时流体压力',
  },
  flow_rate: {
    value: 'flow_rate',
    label: '单管道流速',
    unit: 'L/min',
    defaultThreshold: 0.05,
    step: 0.01,
    description: '单管道微流速监测 (防干烧)',
  },
  water_level_tank1: {
    value: 'water_level_tank1',
    label: '水槽1水位',
    unit: '%',
    defaultThreshold: 20,
    step: 1,
    description: '水槽1液位百分比',
  },
  water_level_tank2: {
    value: 'water_level_tank2',
    label: '水槽2水位',
    unit: '%',
    defaultThreshold: 20,
    step: 1,
    description: '水槽2液位百分比',
  },
  water_level_diff: {
    value: 'water_level_diff',
    label: '双水槽水位差',
    unit: '%',
    defaultThreshold: 30,
    step: 1,
    description: '双槽液位高度差',
  },
};

export interface SystemStatus {
  telemetry?: TelemetryData;
  device_state: DeviceState;
  thresholds: ThresholdConfig;
  active_alarms: AlarmEvent[];
  alarm_rules?: AlarmRule[];
  tcp_client_connected: boolean;
  last_packet_time?: string;
}
