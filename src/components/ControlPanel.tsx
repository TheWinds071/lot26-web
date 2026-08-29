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
  const [tempDiffMax, setTempDiffMax] = useState<number>(15);
  const [pressMax, setPressMax] = useState<number>(0.80);
  const [flowMin, setFlowMin] = useState<number>(5.0);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (thresholds) {
      setTempMin(thresholds.temp_min);
      setTempTarget(thresholds.temp_target);
      setTempMax(thresholds.temp_max);
      setTempDiffMax(thresholds.temp_diff_max ?? 15);
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
      temp_diff_max: Number(tempDiffMax),
      pressure_min: 0.10,
      pressure_max: Number(pressMax),
      flow_rate_min: Number(flowMin),
      flow_rate_target: 25.0,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
      {/* 1. Actuator Remote Control Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-gray-900">
                水槽循环执行器控制
              </h3>
              <p className="text-xs text-gray-500 font-normal">
                Inter-tank Circulation Pump & Heater Controls
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">运行模式</span>
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-xs transition-all duration-200 active:scale-[0.98] ${
                isAuto
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
              onClick={() => onSetMode(!isAuto)}
              title={isAuto ? "切换为手动模式" : "切换为智能自控模式"}
            >
              {isAuto ? <ToggleRight className="w-4 h-4 text-blue-600" /> : <ToggleLeft className="w-4 h-4 text-amber-600" />}
              <span>{isAuto ? '智能自控' : '手动模式'}</span>
            </button>
          </div>
        </div>

        {isEmergency && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <span>⚠️ 紧急急停已触发！所有手动控制已被锁定，请先解除顶部急停。</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Pump Control Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <RotateCw
                  className={`w-4 h-4 ${
                    isPumpActive ? 'text-blue-600 animate-spin' : 'text-gray-400'
                  }`}
                />
                <span className="text-sm font-semibold text-gray-800">槽间循环水泵</span>
              </div>
              <button
                disabled={isEmergency}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-xs transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPumpActive
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => onControlPump(!isPumpActive, pumpSpeed)}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isPumpActive ? '运行中' : '已停止'}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-600">
                <span>水泵转速/输送流量设定</span>
                <span className="font-mono font-bold text-gray-900">{pumpSpeed}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={pumpSpeed}
                disabled={isEmergency}
                onChange={(e) => onControlPump(isPumpActive, Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Heater Control Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame
                  className={`w-4 h-4 ${
                    isHeaterActive ? 'text-amber-500 animate-pulse' : 'text-gray-400'
                  }`}
                />
                <span className="text-sm font-semibold text-gray-800">加热模块</span>
              </div>
              <button
                disabled={isEmergency}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-xs transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                  isHeaterActive
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => onControlHeater(!isHeaterActive, isHeaterActive ? 0 : 100)}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isHeaterActive ? '加热中' : '待机'}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-600">
                <span>加热输出功率</span>
                <span className="font-mono font-bold text-gray-900">{heaterPower}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={heaterPower}
                disabled={isEmergency}
                onChange={(e) =>
                  onControlHeater(Number(e.target.value) > 0, Number(e.target.value))
                }
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {isAuto && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50/70 border border-blue-100 text-blue-900 text-xs leading-relaxed">
            💡 <strong>智能自控模式生效中</strong>：系统实时根据双水槽水温、管道压力与循环流量闭环调控水泵与加热器，超压、超温或干烧时毫秒级联锁停机。
          </div>
        )}
      </div>

      {/* 2. Threshold Configuration Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-gray-900">
                自控规则与安全阈值设定
              </h3>
              <p className="text-xs text-gray-500 font-normal">
                Dual-Tank Control Setpoints & Safety Interlocks
              </p>
            </div>
          </div>

          {savedSuccess && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fadeIn">
              <Check className="w-3.5 h-3.5" /> 已生效
            </span>
          )}
        </div>

        <form onSubmit={handleSaveThresholds} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Min Temp */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">
                低温加热阈值 (Min Temp)
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step="0.5"
                  value={tempMin}
                  onChange={(e) => setTempMin(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 font-mono"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  °C
                </span>
              </div>
              <span className="text-[11px] text-gray-500">水槽水温低于此值时自动启动加热</span>
            </div>

            {/* Target Temp */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">
                目标恒温 (Target Temp)
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step="0.5"
                  value={tempTarget}
                  onChange={(e) => setTempTarget(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 font-mono"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  °C
                </span>
              </div>
              <span className="text-[11px] text-gray-500">平均水温达到此值时自动关闭加热</span>
            </div>

            {/* Max Temp */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">
                超温保护上限 (Max Temp)
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step="0.5"
                  value={tempMax}
                  onChange={(e) => setTempMax(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 font-mono"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  °C
                </span>
              </div>
              <span className="text-[11px] text-gray-500">任一水槽超温时强制关闭加热并报警</span>
            </div>

            {/* Temp Diff Max */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">
                双槽温差上限 (Max Temp Diff)
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step="0.5"
                  value={tempDiffMax}
                  onChange={(e) => setTempDiffMax(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 font-mono"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  °C
                </span>
              </div>
              <span className="text-[11px] text-gray-500">双水槽温差过大时触发平衡预警</span>
            </div>

            {/* Max Pressure */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">
                超压停泵阈值 (Max Pressure)
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step="0.05"
                  value={pressMax}
                  onChange={(e) => setPressMax(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 font-mono"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  MPa
                </span>
              </div>
              <span className="text-[11px] text-gray-500">管道压力超标时停泵保护管路</span>
            </div>

            {/* Min Flow */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 block">
                最小流量防干烧 (Min Flow)
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step="0.5"
                  value={flowMin}
                  onChange={(e) => setFlowMin(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 font-mono"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  L/min
                </span>
              </div>
              <span className="text-[11px] text-gray-500">水泵循环流量过低时切断加热</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存阈值规则</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
