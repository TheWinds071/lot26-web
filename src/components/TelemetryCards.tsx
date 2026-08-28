import React from 'react';
import { Flame, Gauge, RotateCw, Thermometer, Waves, Zap } from 'lucide-react';
import type { DeviceState, TelemetryData, ThresholdConfig } from '../types';

interface TelemetryCardsProps {
  telemetry?: TelemetryData;
  deviceState?: DeviceState;
  thresholds?: ThresholdConfig;
}

export const TelemetryCards: React.FC<TelemetryCardsProps> = ({
  telemetry,
  deviceState,
  thresholds,
}) => {
  const temp = telemetry?.temperature ?? 0;
  const press = telemetry?.pressure ?? 0;
  const flow = telemetry?.flow_rate ?? 0;

  const tempMin = thresholds?.temp_min ?? 45;
  const tempMax = thresholds?.temp_max ?? 75;
  const tempTarget = thresholds?.temp_target ?? 55;

  const pressMax = thresholds?.pressure_max ?? 0.8;
  const flowMin = thresholds?.flow_rate_min ?? 5.0;

  // Temperature Status
  let tempStatusText = "正常恒温";
  let tempStatusClass = "status-tag-green";
  if (temp < tempMin) {
    tempStatusText = "水温偏低 (加热中)";
    tempStatusClass = "status-tag-blue";
  } else if (temp > tempMax) {
    tempStatusText = "超温告警";
    tempStatusClass = "status-tag-red";
  }

  // Pressure Status
  let pressStatusText = "压力平稳";
  let pressStatusClass = "status-tag-green";
  if (press >= pressMax) {
    pressStatusText = "超压危险";
    pressStatusClass = "status-tag-red";
  } else if (press < 0.1) {
    pressStatusText = "低压/待机";
    pressStatusClass = "status-tag-yellow";
  }

  // Flow Status
  let flowStatusText = "循环畅通";
  let flowStatusClass = "status-tag-green";
  if (deviceState?.pump_active && flow < flowMin) {
    flowStatusText = "流量过低 (防干烧)";
    flowStatusClass = "status-tag-red";
  } else if (!deviceState?.pump_active) {
    flowStatusText = "水泵停机";
    flowStatusClass = "status-tag-yellow";
  }

  const tempPercentage = Math.min(100, Math.max(0, (temp / 100) * 100));
  const pressPercentage = Math.min(100, Math.max(0, (press / 1.0) * 100));
  const flowPercentage = Math.min(100, Math.max(0, (flow / 40.0) * 100));

  return (
    <div className="telemetry-grid">
      {/* Water Temperature Card */}
      <div className="telemetry-card card-temp">
        <div className="card-top">
          <div className="card-icon-box icon-temp">
            <Thermometer size={24} />
          </div>
          <span className={`status-tag ${tempStatusClass}`}>{tempStatusText}</span>
        </div>
        <div className="card-body">
          <span className="card-label">管道水温 (Water Temp)</span>
          <div className="card-value-group">
            <span className="card-value">{temp.toFixed(1)}</span>
            <span className="card-unit">°C</span>
          </div>
        </div>
        <div className="card-footer">
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill fill-temp"
              style={{ width: `${tempPercentage}%` }}
            ></div>
          </div>
          <div className="card-meta">
            <span>目标: {tempTarget}°C</span>
            <span>区间: {tempMin} ~ {tempMax}°C</span>
          </div>
        </div>
      </div>

      {/* Pipe Pressure Card */}
      <div className="telemetry-card card-pressure">
        <div className="card-top">
          <div className="card-icon-box icon-pressure">
            <Gauge size={24} />
          </div>
          <span className={`status-tag ${pressStatusClass}`}>{pressStatusText}</span>
        </div>
        <div className="card-body">
          <span className="card-label">管道压力 (Pipe Pressure)</span>
          <div className="card-value-group">
            <span className="card-value">{press.toFixed(2)}</span>
            <span className="card-unit">MPa</span>
          </div>
        </div>
        <div className="card-footer">
          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${press >= pressMax ? 'fill-danger' : 'fill-pressure'}`}
              style={{ width: `${pressPercentage}%` }}
            ></div>
          </div>
          <div className="card-meta">
            <span>安全上限: {pressMax.toFixed(2)} MPa</span>
            <span>约 {(press * 10).toFixed(1)} bar</span>
          </div>
        </div>
      </div>

      {/* Pipe Flow Rate Card */}
      <div className="telemetry-card card-flow">
        <div className="card-top">
          <div className="card-icon-box icon-flow">
            <Waves size={24} />
          </div>
          <span className={`status-tag ${flowStatusClass}`}>{flowStatusText}</span>
        </div>
        <div className="card-body">
          <span className="card-label">循环流量 (Flow Rate)</span>
          <div className="card-value-group">
            <span className="card-value">{flow.toFixed(1)}</span>
            <span className="card-unit">L/min</span>
          </div>
        </div>
        <div className="card-footer">
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill fill-flow"
              style={{ width: `${flowPercentage}%` }}
            ></div>
          </div>
          <div className="card-meta">
            <span>下限保护: {flowMin.toFixed(1)} L/min</span>
            <span>流速系数: {(flow / 25).toFixed(2)}x</span>
          </div>
        </div>
      </div>

      {/* Actuators Summary Card */}
      <div className="telemetry-card card-actuator">
        <div className="card-top">
          <div className="card-icon-box icon-actuator">
            <Zap size={24} />
          </div>
          <span className="status-tag status-tag-purple">执行机构</span>
        </div>
        <div className="card-actuator-body">
          {/* Pump Status Item */}
          <div className="actuator-item">
            <div className="actuator-info">
              <RotateCw
                size={18}
                className={`actuator-spin ${deviceState?.pump_active ? 'spinning' : ''}`}
              />
              <span className="actuator-title">循环水泵</span>
            </div>
            <div className="actuator-state">
              <span className={`state-badge ${deviceState?.pump_active ? 'badge-on' : 'badge-off'}`}>
                {deviceState?.pump_active ? `运行中 (${deviceState.pump_speed}%)` : '已停止'}
              </span>
            </div>
          </div>

          {/* Heater Status Item */}
          <div className="actuator-item">
            <div className="actuator-info">
              <Flame
                size={18}
                className={deviceState?.heater_active ? 'glowing-fire' : ''}
              />
              <span className="actuator-title">加热模块</span>
            </div>
            <div className="actuator-state">
              <span className={`state-badge ${deviceState?.heater_active ? 'badge-heating' : 'badge-off'}`}>
                {deviceState?.heater_active ? `加热中 (${deviceState.heater_power}%)` : '待机'}
              </span>
            </div>
          </div>
        </div>
        <div className="card-meta" style={{ marginTop: 'auto', paddingTop: '10px' }}>
          <span>自控响应: 自动恒温与超压联锁</span>
        </div>
      </div>
    </div>
  );
};
