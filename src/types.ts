export interface TelemetryData {
  device_id: string;
  temp_tank1: number;
  temp_tank2: number;
  temperature: number;
  pressure: number; // 单管路水流压力 (Pa)
  flow_rate: number;
  total_volume?: number; // 管道累计流量 (L)
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
  accumulated_volume?: number; // 当前批次累计水量 (L)
  target_volume_reached?: boolean; // 是否已达目标供水量并停泵
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
  target_volume?: number; // 目标供水量设定阈值 (L)
  volume_control_enabled?: boolean; // 是否启用定水量自动停泵
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
  | 'accumulated_volume'
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
  accumulated_volume: {
    value: 'accumulated_volume',
    label: '累计供水量',
    unit: 'L',
    defaultThreshold: 10,
    step: 0.5,
    description: '当前批次/累计流过的水流量',
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

export interface SystemConfigResponse {
  status: string;
  config_file: string | null;
  config: {
    system?: {
      system_id?: string;
      system_name?: string;
      version?: string;
      description?: string;
      topology_type?: string;
    };
    communication_protocols?: {
      tcp_socket?: {
        server?: {
          host?: string;
          port?: number;
          max_connections?: number;
        };
        client_defaults?: {
          remote_host?: string;
          remote_port?: number;
        };
      };
      websocket?: {
        endpoint?: string;
        protocol?: string;
      };
      http_api?: {
        host?: string;
        port?: number;
        api_prefix?: string;
      };
    };
    storage_tank?: {
      tank_id?: string;
      name?: string;
      display_label?: string;
      physical_specs?: {
        rated_capacity_liters?: number;
        usable_capacity_liters?: number;
        material?: string;
      };
      temperature_monitoring?: {
        nominal_temperature_celsius?: number;
        high_temp_alarm_threshold_celsius?: number;
        unit?: string;
      };
      water_level_monitoring?: {
        nominal_level_percentage?: number;
        low_level_alarm_threshold?: number;
        high_level_alarm_threshold?: number;
        unit?: string;
      };
    };
    heating_tank?: {
      tank_id?: string;
      name?: string;
      display_label?: string;
      physical_specs?: {
        rated_capacity_liters?: number;
        usable_capacity_liters?: number;
        material?: string;
      };
      heating_module?: {
        module_id?: string;
        rated_power_watts?: number;
        temperature_control_thresholds?: {
          target_temperature_celsius?: number;
          min_trigger_temperature_celsius?: number;
          max_temperature_limit_celsius?: number;
          hysteresis_celsius?: number;
        };
        safety_interlocks?: {
          prevent_dry_run_enabled?: boolean;
          min_required_flow_lpm?: number;
          min_safe_water_level_percentage?: number;
        };
      };
      temperature_monitoring?: {
        nominal_temperature_celsius?: number;
        high_temp_alarm_threshold_celsius?: number;
        unit?: string;
      };
      water_level_monitoring?: {
        nominal_level_percentage?: number;
        low_level_alarm_threshold?: number;
        high_level_alarm_threshold?: number;
        unit?: string;
      };
    };
    single_pipeline_network?: {
      pipe_specs?: {
        nominal_diameter?: string;
        max_allowable_working_pressure_pa?: number;
      };
      bidirectional_pump?: {
        pump_name?: string;
        max_flow_rate_lpm?: number;
      };
      pressure_sensor?: {
        overpressure_alarm_threshold_pa?: number;
      };
      flow_sensor?: {
        target_flow_rate_lpm?: number;
        min_flow_dry_run_threshold_lpm?: number;
        volume_control?: {
          enabled?: boolean;
          target_volume_liters?: number;
          auto_stop_pump?: boolean;
          unit?: string;
        };
      };
    };
    system_safety_thresholds?: {
      max_temperature_difference_celsius?: number;
    };
    [key: string]: any;
  };
}
