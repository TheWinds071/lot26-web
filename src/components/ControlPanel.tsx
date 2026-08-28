import React, { useEffect, useState } from 'react';
import { Check, Flame, Power, RotateCw, Save, Settings, Sliders, ToggleLeft, ToggleRight } from 'lucide-react';
import type { DeviceState, ThresholdConfig } from '../types';

interface ControlPanelProps {
  deviceState?: DeviceState;
  thresholds?: ThresholdConfig;
  onSetMode: (autoMode: boolean) => void;
  onControlPump: (active: boolean, speed?: number) => void;
  onControlHeater: (active: boolean, power?: number) => void;
  onUpdateThresholds: (config: ThresholdConfig) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  deviceState,
  thresholds,
  onSetMode,
  onControlPump,
  onControlHeater,
  onUpdateThresholds,
}) => {
  const isAuto = deviceState?.auto_mode ?? true;
  const isEmergency = deviceState?.emergency_stop ?? false;
  const isPumpActive = deviceState?.pump_active ?? false;
  const pumpSpeed = deviceState?.pump_speed ?? 60;
  const isHeaterActive = deviceState?.heater_active ?? false;
  const heaterPower = deviceState?.heater_power ?? 0;

  // Local form state for thresholds
  const [tempMin, setTempMin] = useState<number>(45);
  const [tempTarget, setTempTarget] = useState<number>(55);
  const [tempMax, setTempMax] = useState<number>(75);
  const [pressMax, setPressMax] = useState<number>(0.80);
  const [flowMin, setFlowMin] = useState<number>(5.0);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (thresholds) {
      setTempMin(thresholds.temp_min);
      setTempTarget(thresholds.temp_target);
      setTempMax(thresholds.temp_max);
      setPressMax(thresholds.pressure_max);
      setFlowMin(thresholds.flow_rate_min);
    }
  }, [thresholds]);

  const handleSaveThresholds = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateThresholds({
      temp_min: Number(tempMin),
      temp_target: Number(tempTarget),
      temp_max: Number(tempMax),
      pressure_min: 0.10,
      pressure_max: Number(pressMax),
      flow_rate_min: Number(flowMin),
      flow_rate_target: 25.0,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="controls-container">
      {/* 1. Actuator Remote Control Card */}
      <div className="control-card">
        <div className="control-card-header">
          <div className="section-title-group">
            <Sliders className="section-title-icon" size={20} />
            <h3>执行器控制中心</h3>
          </div>
          {/* Mode Switcher */}
          <div className="mode-toggle-group">
            <span className="mode-label">自控模式</span>
            <button
              className={`btn-mode-toggle ${isAuto ? 'btn-mode-auto' : 'btn-mode-manual'}`}
              onClick={() => onSetMode(!isAuto)}
              title={isAuto ? "切换为手动模式" : "切换为智能自控模式"}
            >
              {isAuto ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
              <span>{isAuto ? '已开启' : '手动模式'}</span>
            </button>
          </div>
        </div>

        {isEmergency && (
          <div className="emergency-warning-banner">
            ⚠️ 紧急急停已触发！所有手动控制已被锁定，请先解除顶部急停。
          </div>
        )}

        <div className="actuators-control-grid">
          {/* Pump Control Section */}
          <div className={`control-block ${!isAuto ? 'highlight-manual' : ''}`}>
            <div className="control-block-header">
              <div className="block-title">
                <RotateCw size={18} className={isPumpActive ? 'spinning' : ''} />
                <span>循环水泵控制</span>
              </div>
              <button
                disabled={isEmergency}
                className={`btn-switch ${isPumpActive ? 'btn-switch-on' : 'btn-switch-off'}`}
                onClick={() => onControlPump(!isPumpActive, pumpSpeed)}
              >
                <Power size={14} />
                <span>{isPumpActive ? '运行中' : '已停止'}</span>
              </button>
            </div>

            <div className="control-slider-group">
              <div className="slider-label-row">
                <span>水泵转速/功率设定</span>
                <span className="slider-value">{pumpSpeed}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={pumpSpeed}
                disabled={isEmergency}
                onChange={(e) => onControlPump(isPumpActive, Number(e.target.value))}
                className="custom-range range-blue"
              />
            </div>
          </div>

          {/* Heater Control Section */}
          <div className={`control-block ${!isAuto ? 'highlight-manual' : ''}`}>
            <div className="control-block-header">
              <div className="block-title">
                <Flame size={18} className={isHeaterActive ? 'glowing-fire' : ''} />
                <span>加热模块控制</span>
              </div>
              <button
                disabled={isEmergency}
                className={`btn-switch ${isHeaterActive ? 'btn-switch-heating' : 'btn-switch-off'}`}
                onClick={() => onControlHeater(!isHeaterActive, isHeaterActive ? 0 : 100)}
              >
                <Power size={14} />
                <span>{isHeaterActive ? '加热中' : '待机'}</span>
              </button>
            </div>

            <div className="control-slider-group">
              <div className="slider-label-row">
                <span>加热输出功率设定</span>
                <span className="slider-value">{heaterPower}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={heaterPower}
                disabled={isEmergency}
                onChange={(e) => onControlHeater(Number(e.target.value) > 0, Number(e.target.value))}
                className="custom-range range-orange"
              />
            </div>
          </div>
        </div>

        {isAuto && (
          <div className="auto-mode-hint">
            💡 当前处于<strong>智能自控模式</strong>：系统将根据下方阈值自动启闭水泵与加热器，超压或水温过高时自动执行联锁保护。
          </div>
        )}
      </div>

      {/* 2. Threshold Configuration Card */}
      <div className="control-card">
        <div className="control-card-header">
          <div className="section-title-group">
            <Settings className="section-title-icon" size={20} />
            <h3>自控规则与安全阈值设定</h3>
          </div>
          {savedSuccess && (
            <span className="save-success-tag">
              <Check size={14} /> 已生效
            </span>
          )}
        </div>

        <form onSubmit={handleSaveThresholds} className="thresholds-form">
          <div className="form-grid">
            <div className="form-item">
              <label>低温加热阈值 (Min Temp)</label>
              <div className="input-group">
                <input
                  type="number"
                  step="0.5"
                  value={tempMin}
                  onChange={(e) => setTempMin(Number(e.target.value))}
                />
                <span className="input-unit">°C</span>
              </div>
              <span className="input-tip">水温低于此值时自动启动加热</span>
            </div>

            <div className="form-item">
              <label>目标恒温 (Target Temp)</label>
              <div className="input-group">
                <input
                  type="number"
                  step="0.5"
                  value={tempTarget}
                  onChange={(e) => setTempTarget(Number(e.target.value))}
                />
                <span className="input-unit">°C</span>
              </div>
              <span className="input-tip">水温达到此值时自动关闭加热</span>
            </div>

            <div className="form-item">
              <label>超温保护上限 (Max Temp)</label>
              <div className="input-group">
                <input
                  type="number"
                  step="0.5"
                  value={tempMax}
                  onChange={(e) => setTempMax(Number(e.target.value))}
                />
                <span className="input-unit">°C</span>
              </div>
              <span className="input-tip">超温时强制关闭加热并报警</span>
            </div>

            <div className="form-item">
              <label>超压停泵阈值 (Max Pressure)</label>
              <div className="input-group">
                <input
                  type="number"
                  step="0.05"
                  value={pressMax}
                  onChange={(e) => setPressMax(Number(e.target.value))}
                />
                <span className="input-unit">MPa</span>
              </div>
              <span className="input-tip">压力超标时停泵保护管道</span>
            </div>

            <div className="form-item">
              <label>最小流量防干烧 (Min Flow)</label>
              <div className="input-group">
                <input
                  type="number"
                  step="0.5"
                  value={flowMin}
                  onChange={(e) => setFlowMin(Number(e.target.value))}
                />
                <span className="input-unit">L/min</span>
              </div>
              <span className="input-tip">流量过低时切断加热防干烧</span>
            </div>
          </div>

          <div className="form-footer">
            <button type="submit" className="btn-save-thresholds">
              <Save size={16} />
              <span>保存阈值规则</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
