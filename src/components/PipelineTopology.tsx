import React, { useState } from 'react';
import { ArrowLeftRight, Check, ChevronDown, ChevronUp, Droplets, RotateCcw, Sliders, Waves, X } from 'lucide-react';
import type { DeviceState, SystemConfigResponse, TelemetryData } from '../types';

interface PipelineTopologyProps {
  telemetry?: TelemetryData;
  deviceState?: DeviceState;
  systemConfig?: SystemConfigResponse | null;
  onSetWaterLevels?: (level1?: number, level2?: number) => void;
}

export const PipelineTopology: React.FC<PipelineTopologyProps> = ({
  telemetry,
  deviceState,
  systemConfig,
  onSetWaterLevels,
}) => {
  const tank1Cfg = systemConfig?.config?.storage_tank;
  const tank2Cfg = systemConfig?.config?.heating_tank;
  const tank1Name = tank1Cfg?.name || '水槽 1';
  const tank2Name = tank2Cfg?.name || '水槽 2';
  const tank1Label = tank1Cfg?.display_label || '储水槽 / 常温供水';
  const tank2Label = tank2Cfg?.display_label || '加热水槽 / 恒温区';
  const isPumpOn = (deviceState?.pump_active ?? false) && !deviceState?.emergency_stop;
  const pumpDirection = deviceState?.pump_direction ?? 'FORWARD';
  const isForward = pumpDirection === 'FORWARD';
  const isHeaterOn = (deviceState?.heater_active ?? false) && !deviceState?.emergency_stop;
  const isRelayOn = (deviceState?.relay_active ?? false) && !deviceState?.emergency_stop;
  const pumpSpeed = deviceState?.pump_speed ?? 0;

  const t1 = telemetry?.temp_tank1 ?? telemetry?.temperature ?? 0;
  const t2 = telemetry?.temp_tank2 ?? telemetry?.temperature ?? 0;
  const press = telemetry?.pressure ?? 0;
  const flow = telemetry?.flow_rate ?? 0;
  const accumulatedVol = deviceState?.accumulated_volume ?? telemetry?.total_volume ?? 0;
  const isTargetReached = deviceState?.target_volume_reached ?? false;

  // Local state for Initial Water Level adjustment and immediate reactive updates
  const [localLvl1, setLocalLvl1] = useState<number | null>(null);
  const [localLvl2, setLocalLvl2] = useState<number | null>(null);

  // Sync with incoming telemetry if new data arrives
  React.useEffect(() => {
    if (telemetry?.water_level_tank1 !== undefined) {
      setLocalLvl1(telemetry.water_level_tank1);
    }
  }, [telemetry?.water_level_tank1]);

  React.useEffect(() => {
    if (telemetry?.water_level_tank2 !== undefined) {
      setLocalLvl2(telemetry.water_level_tank2);
    }
  }, [telemetry?.water_level_tank2]);

  const lvl1 = Math.max(0, Math.min(100, localLvl1 !== null ? localLvl1 : (telemetry?.water_level_tank1 ?? 75.0)));
  const lvl2 = Math.max(0, Math.min(100, localLvl2 !== null ? localLvl2 : (telemetry?.water_level_tank2 ?? 65.0)));

  // Tank 1 dimensions (mm) and calculated capacity (L) from config.json5
  const dims1 = tank1Cfg?.physical_specs?.dimensions_mm;
  const l1 = Number(dims1?.length ?? 500);
  const w1 = Number(dims1?.width ?? dims1?.width_or_diameter ?? 250);
  const h1 = Number(dims1?.height ?? 800);
  const cap1 = Number(tank1Cfg?.physical_specs?.rated_capacity_liters ?? (l1 * w1 * h1) / 1_000_000);
  const vol1 = (lvl1 / 100) * cap1;
  const height1Mm = (lvl1 / 100) * h1;

  // Tank 2 dimensions (mm) and calculated capacity (L) from config.json5
  const dims2 = tank2Cfg?.physical_specs?.dimensions_mm;
  const l2 = Number(dims2?.length ?? 500);
  const w2 = Number(dims2?.width ?? dims2?.width_or_diameter ?? 250);
  const h2 = Number(dims2?.height ?? 800);
  const cap2 = Number(tank2Cfg?.physical_specs?.rated_capacity_liters ?? (l2 * w2 * h2) / 1_000_000);
  const vol2 = (lvl2 / 100) * cap2;
  const height2Mm = (lvl2 / 100) * h2;

  const forwardComp = Number(systemConfig?.config?.single_pipeline_network?.flow_sensor?.volume_control?.forward_compensation_percent ?? 40);
  const reverseComp = Number(systemConfig?.config?.single_pipeline_network?.flow_sensor?.volume_control?.reverse_compensation_percent ?? 40);
  const activeComp = isForward ? forwardComp : reverseComp;
  const displayAccumulatedVol = activeComp > 0
    ? accumulatedVol / (1 + activeComp / 100)
    : accumulatedVol;

  // Dynamic fluid transfer when pump is active
  React.useEffect(() => {
    if (!isPumpOn || flow <= 0.001) return;
    const timer = setInterval(() => {
      // dv in 0.5s = (flow / 60) * 0.5 Liters
      const dv = (flow / 60.0) * 0.5;
      const d1 = (dv / cap1) * 100;
      const d2 = (dv / cap2) * 100;
      if (isForward) {
        setLocalLvl1((prev) => Math.max(0, (prev ?? lvl1) - d1));
        setLocalLvl2((prev) => Math.min(100, (prev ?? lvl2) + d2));
      } else {
        setLocalLvl1((prev) => Math.min(100, (prev ?? lvl1) + d1));
        setLocalLvl2((prev) => Math.max(0, (prev ?? lvl2) - d2));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [isPumpOn, flow, isForward, cap1, cap2]);

  // Local state for Initial Water Level adjustment panel
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [inputLvl1, setInputLvl1] = useState<number>(lvl1);
  const [inputLvl2, setInputLvl2] = useState<number>(lvl2);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleOpenSetting = () => {
    setInputLvl1(lvl1);
    setInputLvl2(lvl2);
    setIsSettingOpen(!isSettingOpen);
  };

  const handleApplyLevels = (e: React.FormEvent) => {
    e.preventDefault();
    const val1 = Number(inputLvl1);
    const val2 = Number(inputLvl2);
    setLocalLvl1(val1);
    setLocalLvl2(val2);
    if (onSetWaterLevels) {
      onSetWaterLevels(val1, val2);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  const handleResetToNominal = () => {
    const nom1 = Number(tank1Cfg?.water_level_monitoring?.initial_level_percentage ?? tank1Cfg?.water_level_monitoring?.nominal_level_percentage ?? 75.0);
    const nom2 = Number(tank2Cfg?.water_level_monitoring?.initial_level_percentage ?? tank2Cfg?.water_level_monitoring?.nominal_level_percentage ?? 65.0);
    setInputLvl1(nom1);
    setInputLvl2(nom2);
    setLocalLvl1(nom1);
    setLocalLvl2(nom2);
    if (onSetWaterLevels) {
      onSetWaterLevels(nom1, nom2);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  // Animation duration based on flow rate & pump speed (Adaptive to 0 ~ 0.4 L/min micro-flow)
  const maxFlowRef = flow <= 1.0 ? 0.4 : 30.0;
  const flowRatio = Math.min(1.0, Math.max(0, flow / maxFlowRef));
  const activeRate = flowRatio > 0 ? flowRatio : (pumpSpeed > 0 ? pumpSpeed / 100 : 0.25);
  const flowAnimDuration = isPumpOn && (flow > 0.001 || pumpSpeed > 0)
    ? Math.max(0.35, Number((2.6 - activeRate * 2.0).toFixed(2)))
    : 0;
  const pumpRotateDuration = Math.max(0.3, 1.8 - (pumpSpeed / 100) * 1.4);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <Waves className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              单管路双水槽正反转拓扑仿真 (Digital Twin)
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              Single-Pipe Dual-Tank Inter-Transfer with Bidirectional Flow Pump
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleOpenSetting}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border shadow-xs transition-all cursor-pointer ${
              isSettingOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            title="调节修改两水槽起始液位并自动根据尺寸换算"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>调节起始水位</span>
            {isSettingOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              isPumpOn
                ? isForward
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {isPumpOn
              ? isForward
                ? `正转流向: 水槽1 ➔ 水槽2 (${flow.toFixed(2)} L/min)`
                : `反转流向: 水槽2 ➔ 水槽1 (${flow.toFixed(2)} L/min)`
              : '水泵停止 (流体静止)'}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${
              isTargetReached
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-cyan-50 text-cyan-800 border-cyan-200'
            }`}
          >
            <Droplets className="w-3.5 h-3.5 text-cyan-600" />
            <span>
              累计供水: {displayAccumulatedVol.toFixed(2)} L
              {isTargetReached && ' (定量已达标)'}
            </span>
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
              isHeaterOn
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            加热模块: {isHeaterOn ? '加热中' : '待机'}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
              isRelayOn
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            控制继电器: {isRelayOn ? '闭合导通' : '断开隔离'}
          </span>
        </div>
      </div>

      {/* Collapsible Initial Water Level Configuration Panel */}
      {isSettingOpen && (
        <form onSubmit={handleApplyLevels} className="mb-4 bg-slate-50 border border-blue-200 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                <Droplets className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-800">
                  水槽起始水位与尺寸容积自动换算 (Water Level & Physical Dimensions)
                </h4>
                <p className="text-[11px] text-gray-500">
                  可分别设定两水槽初始液位百分比，系统自动根据 config.json5 中配置的长宽高截面积换算容积 (L) 与水深 (mm)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {savedSuccess && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  <Check className="w-3 h-3" /> 起始水位已更新
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsSettingOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            {/* Tank 1 Setting */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-gray-800">{tank1Name} (储水槽) 起始水位</span>
                <span className="text-[11px] font-mono text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                  {inputLvl1.toFixed(1)}% ({((inputLvl1 / 100) * cap1).toFixed(1)}L / {Math.round((inputLvl1 / 100) * h1)}mm)
                </span>
              </div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>尺寸规格 (config.json5): {l1} × {w1} × {h1} mm</span>
                <span>截面积: {(l1 * w1 / 10000).toFixed(1)} dm² | 满容积: {cap1} L</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={inputLvl1}
                  onChange={(e) => setInputLvl1(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex items-center w-20">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={inputLvl1}
                    onChange={(e) => setInputLvl1(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 text-xs text-right border border-gray-300 rounded font-mono"
                  />
                  <span className="text-xs text-gray-500 ml-1">%</span>
                </div>
              </div>
              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-400">快速设置:</span>
                {[20, 50, 75, 95].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setInputLvl1(pct)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                      inputLvl1 === pct
                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                        : 'bg-slate-50 text-gray-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Tank 2 Setting */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-gray-800">{tank2Name} (加热槽) 起始水位</span>
                <span className="text-[11px] font-mono text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                  {inputLvl2.toFixed(1)}% ({((inputLvl2 / 100) * cap2).toFixed(1)}L / {Math.round((inputLvl2 / 100) * h2)}mm)
                </span>
              </div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>尺寸规格 (config.json5): {l2} × {w2} × {h2} mm</span>
                <span>截面积: {(l2 * w2 / 10000).toFixed(1)} dm² | 满容积: {cap2} L</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={inputLvl2}
                  onChange={(e) => setInputLvl2(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex items-center w-20">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={inputLvl2}
                    onChange={(e) => setInputLvl2(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 text-xs text-right border border-gray-300 rounded font-mono"
                  />
                  <span className="text-xs text-gray-500 ml-1">%</span>
                </div>
              </div>
              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-400">快速设置:</span>
                {[20, 50, 65, 95].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setInputLvl2(pct)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                      inputLvl2 === pct
                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                        : 'bg-slate-50 text-gray-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleResetToNominal}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复配置默认 ({tank1Cfg?.water_level_monitoring?.nominal_level_percentage ?? 75}% / {tank2Cfg?.water_level_monitoring?.nominal_level_percentage ?? 65}%)</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettingOpen(false)}
                className="px-3 py-1 text-xs text-gray-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                收起
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>设定起始水位</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* SVG Single-Pipe Dual-Tank Canvas */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <svg
          viewBox="0 0 980 320"
          className="w-full h-auto min-w-[720px] block"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Water gradient for heated flow */}
            <linearGradient id="singlePipeWaterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isHeaterOn ? "#f59e0b" : "#0284c7"} />
              <stop offset="50%" stopColor={isHeaterOn ? "#ef4444" : "#0284c7"} />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>

            <style>
              {`
                @keyframes flowForwardDash {
                  from { stroke-dashoffset: 112; }
                  to { stroke-dashoffset: 0; }
                }
                @keyframes flowReverseDash {
                  from { stroke-dashoffset: 0; }
                  to { stroke-dashoffset: 112; }
                }
                .single-pipe-flow {
                  animation: ${
                    isPumpOn && flowAnimDuration > 0
                      ? isForward
                        ? `flowForwardDash ${flowAnimDuration}s linear infinite`
                        : `flowReverseDash ${flowAnimDuration}s linear infinite`
                      : 'none'
                  };
                }

                @keyframes pumpClockwise {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                @keyframes pumpCounterClockwise {
                  from { transform: rotate(360deg); }
                  to { transform: rotate(0deg); }
                }
                .single-pump-impeller {
                  transform-origin: 490px 175px;
                  animation: ${
                    isPumpOn
                      ? isForward
                        ? `pumpClockwise ${pumpRotateDuration}s linear infinite`
                        : `pumpCounterClockwise ${pumpRotateDuration}s linear infinite`
                      : 'none'
                  };
                }
              `}
            </style>
          </defs>

          {/* ================= 1 SINGLE PIPE BETWEEN TANK 1 AND TANK 2 ================= */}
          {/* Main Single Pipe Body (y = 175) */}
          <path
            d="M 190 175 L 790 175"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="28"
            strokeLinecap="round"
          />
          <path
            d="M 190 175 L 790 175"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="20"
            strokeLinecap="round"
          />

          {/* Single Pipe Water Stream */}
          <path
            d="M 190 175 L 790 175"
            fill="none"
            stroke={isHeaterOn ? "url(#singlePipeWaterGrad)" : "#0284c7"}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="16 12"
            className="single-pipe-flow"
            opacity={isPumpOn ? "0.9" : "0.25"}
          />

          {/* Single Pipe Flanges at Tank 1 & Tank 2 */}
          <rect x="185" y="153" width="8" height="44" rx="2" fill="#94a3b8" />
          <rect x="787" y="153" width="8" height="44" rx="2" fill="#94a3b8" />

          {/* ================= TANK 1 (Left: 储水槽1 / 常温储水) ================= */}
          <g transform="translate(60, 45)">
            {/* Tank Outer Shell */}
            <rect x="0" y="0" width="130" height="230" rx="12" fill="#ffffff" stroke="#94a3b8" strokeWidth="2.5" />
            {/* Water Volume in Tank 1 */}
            <rect
              x="8"
              y={220 - (lvl1 / 100) * 195}
              width="114"
              height={(lvl1 / 100) * 195}
              rx="6"
              fill="#e0f2fe"
              opacity="0.85"
            />
            <path
              d={`M 10 ${225 - (lvl1 / 100) * 195} Q 40 ${218 - (lvl1 / 100) * 195}, 70 ${225 - (lvl1 / 100) * 195} T 120 ${225 - (lvl1 / 100) * 195} L 120 215 L 10 215 Z`}
              fill="#38bdf8"
              opacity="0.6"
            />

            {/* Scale Markings Ruler on Tank 1 */}
            <g opacity="0.35" stroke="#64748b" strokeWidth="1">
              <line x1="8" y1="25" x2="16" y2="25" />
              <line x1="8" y1="74" x2="13" y2="74" />
              <line x1="8" y1="123" x2="13" y2="123" />
              <line x1="8" y1="171" x2="13" y2="171" />
              <line x1="8" y1="220" x2="16" y2="220" />
            </g>
            <g opacity="0.45" fontSize="7.5" fill="#64748b" textAnchor="start">
              <text x="18" y="28">100%</text>
              <text x="15" y="77">75%</text>
              <text x="15" y="126">50%</text>
              <text x="15" y="174">25%</text>
            </g>

            {/* Titles */}
            <text x="65" y="30" fill="#0f172a" fontSize="12.5" fontWeight="bold" textAnchor="middle">{tank1Name}</text>
            <text x="65" y="44" fill="#0284c7" fontSize="9.5" fontWeight="500" textAnchor="middle">{tank1Label}</text>

            {/* Realtime Water Level & Volume Readout Badge inside Tank 1 */}
            <g transform="translate(14, 52)">
              <rect x="0" y="0" width="102" height="42" rx="6" fill="#ffffff" fillOpacity="0.92" stroke="#0284c7" strokeWidth="1.2" />
              <text x="51" y="14" fill="#0369a1" fontSize="10.5" fontWeight="bold" textAnchor="middle">
                {lvl1.toFixed(1)}% | {vol1.toFixed(1)}L
              </text>
              <text x="51" y="26" fill="#64748b" fontSize="8" textAnchor="middle">
                高度: {Math.round(height1Mm)}mm ({h1}mm)
              </text>
              <text
                x="51"
                y="37"
                fill={isPumpOn ? (isForward ? "#e11d48" : "#059669") : "#64748b"}
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
              >
                {isPumpOn
                  ? isForward
                    ? `▼ 出水 -${flow.toFixed(2)}L/min`
                    : `▲ 进水 +${flow.toFixed(2)}L/min`
                  : '○ 稳态保持'}
              </text>
            </g>

            {/* Temperature Sensor 1 Probe */}
            <g transform="translate(105, -25)">
              <line x1="0" y1="25" x2="0" y2="70" stroke="#f59e0b" strokeWidth="3" strokeDasharray="3 2" />
              <rect x="-35" y="-10" width="70" height="34" rx="6" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
              <text x="0" y="8" fill="#d97706" fontSize="11" fontWeight="bold" textAnchor="middle">{t1.toFixed(1)}°C</text>
              <text x="0" y="19" fill="#64748b" fontSize="8.5" textAnchor="middle">温度传感器 1</text>
            </g>

            {/* Dimensions Subtitle under Tank 1 */}
            <text x="65" y="244" fill="#64748b" fontSize="8.5" textAnchor="middle">
              尺寸: {l1}×{w1}×{h1}mm ({cap1}L)
            </text>
          </g>

          {/* ================= SENSORS & BIDIRECTIONAL PUMP ON THE SINGLE PIPE ================= */}

          {/* 1. Pipe Pressure Sensor (Left side of pump, x = 320) */}
          <g transform="translate(320, 120)">
            <line x1="20" y1="55" x2="20" y2="28" stroke="#94a3b8" strokeWidth="3" />
            <circle cx="20" cy="14" r="22" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
            <text x="20" y="12" fill="#0284c7" fontSize={press >= 10000 ? "9.5" : "11"} fontWeight="bold" textAnchor="middle">
              {press >= 10 ? Math.round(press) : press.toFixed(1)}
            </text>
            <text x="20" y="23" fill="#64748b" fontSize="9" textAnchor="middle">Pa</text>
            <text x="20" y="-14" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">管道压力传感器</text>
          </g>

          {/* 2. Bidirectional Circulation Pump (Center, x = 490, y = 175) */}
          <g transform="translate(0, 0)">
            <circle cx="490" cy="175" r="32" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
            {/* Impeller */}
            <g className="single-pump-impeller">
              <line x1="490" y1="149" x2="490" y2="201" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <line x1="464" y1="175" x2="516" y2="175" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <line x1="472" y1="157" x2="508" y2="193" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
              <line x1="472" y1="193" x2="508" y2="157" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
              <circle cx="490" cy="175" r="9" fill="#1d4ed8" />
            </g>

            {/* Pump Badge & Direction Info */}
            <rect x="420" y="222" width="140" height="38" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
            <text x="490" y="238" fill="#1e293b" fontSize="11" fontWeight="600" textAnchor="middle">
              双向水泵: {isPumpOn ? `${pumpSpeed}%` : '已停止'}
            </text>
            <text
              x="490"
              y="252"
              fill={isPumpOn ? (isForward ? '#2563eb' : '#4f46e5') : '#64748b'}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
            >
              {isPumpOn
                ? isForward
                  ? '【正转】水槽1 ➔ 水槽2'
                  : '【反转】水槽2 ➔ 水槽1'
                : '待机中'}
            </text>
          </g>

          {/* 3. Bidirectional Flow Rate Meter (Right side of pump, x = 630) */}
          <g transform="translate(630, 136)">
            <rect x="0" y="10" width="88" height="54" rx="6" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
            <text x="44" y="29" fill="#059669" fontSize="11.5" fontWeight="bold" textAnchor="middle">{flow.toFixed(2)} L/min</text>
            <text x="44" y="45" fill="#0284c7" fontSize="9.5" fontWeight="600" textAnchor="middle">累计 {displayAccumulatedVol.toFixed(2)} L</text>
            <text x="44" y="78" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">双向流量传感器</text>
          </g>

          {/* ================= TANK 2 (Right: 储水槽2 / 恒温加热) ================= */}
          <g transform="translate(790, 45)">
            {/* Tank Outer Shell */}
            <rect x="0" y="0" width="130" height="230" rx="12" fill="#ffffff" stroke="#94a3b8" strokeWidth="2.5" />
            {/* Water Volume in Tank 2 */}
            <rect
              x="8"
              y={220 - (lvl2 / 100) * 195}
              width="114"
              height={(lvl2 / 100) * 195}
              rx="6"
              fill={isHeaterOn ? "#fed7aa" : "#e0f2fe"}
              opacity="0.85"
            />
            <path
              d={`M 10 ${225 - (lvl2 / 100) * 195} Q 40 ${218 - (lvl2 / 100) * 195}, 70 ${225 - (lvl2 / 100) * 195} T 120 ${225 - (lvl2 / 100) * 195} L 120 215 L 10 215 Z`}
              fill={isHeaterOn ? "#fb923c" : "#38bdf8"}
              opacity="0.6"
            />

            {/* Scale Markings Ruler on Tank 2 */}
            <g opacity="0.35" stroke="#64748b" strokeWidth="1">
              <line x1="8" y1="25" x2="16" y2="25" />
              <line x1="8" y1="74" x2="13" y2="74" />
              <line x1="8" y1="123" x2="13" y2="123" />
              <line x1="8" y1="171" x2="13" y2="171" />
              <line x1="8" y1="220" x2="16" y2="220" />
            </g>
            <g opacity="0.45" fontSize="7.5" fill="#64748b" textAnchor="start">
              <text x="18" y="28">100%</text>
              <text x="15" y="77">75%</text>
              <text x="15" y="126">50%</text>
              <text x="15" y="174">25%</text>
            </g>

            {/* Titles */}
            <text x="65" y="30" fill="#0f172a" fontSize="12.5" fontWeight="bold" textAnchor="middle">{tank2Name}</text>
            <text x="65" y="44" fill="#0284c7" fontSize="9.5" fontWeight="500" textAnchor="middle">{tank2Label}</text>

            {/* Realtime Water Level & Volume Readout Badge inside Tank 2 */}
            <g transform="translate(14, 52)">
              <rect x="0" y="0" width="102" height="42" rx="6" fill="#ffffff" fillOpacity="0.92" stroke="#0284c7" strokeWidth="1.2" />
              <text x="51" y="14" fill="#0369a1" fontSize="10.5" fontWeight="bold" textAnchor="middle">
                {lvl2.toFixed(1)}% | {vol2.toFixed(1)}L
              </text>
              <text x="51" y="26" fill="#64748b" fontSize="8" textAnchor="middle">
                高度: {Math.round(height2Mm)}mm ({h2}mm)
              </text>
              <text
                x="51"
                y="37"
                fill={isPumpOn ? (isForward ? "#059669" : "#e11d48") : "#64748b"}
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
              >
                {isPumpOn
                  ? isForward
                    ? `▲ 进水 +${flow.toFixed(2)}L/min`
                    : `▼ 出水 -${flow.toFixed(2)}L/min`
                  : '○ 稳态保持'}
              </text>
            </g>

            {/* Heating Element inside Tank 2 */}
            <g transform="translate(25, 175)">
              <rect
                x="0"
                y="0"
                width="80"
                height="32"
                rx="6"
                fill="#ffffff"
                stroke={isHeaterOn ? "#f97316" : "#cbd5e1"}
                strokeWidth="2"
              />
              <path
                d="M 12 16 Q 25 6, 40 16 T 68 16"
                fill="none"
                stroke={isHeaterOn ? "#ef4444" : "#94a3b8"}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <text x="40" y="44" fill={isHeaterOn ? "#ea580c" : "#64748b"} fontSize="10" fontWeight="600" textAnchor="middle">
                {isHeaterOn ? '加热中' : '加热器 待机'}
              </text>
            </g>

            {/* Temperature Sensor 2 Probe */}
            <g transform="translate(25, -25)">
              <line x1="0" y1="25" x2="0" y2="70" stroke="#ea580c" strokeWidth="3" strokeDasharray="3 2" />
              <rect x="-35" y="-10" width="70" height="34" rx="6" fill="#ffffff" stroke="#ea580c" strokeWidth="2" />
              <text x="0" y="8" fill="#c2410c" fontSize="11" fontWeight="bold" textAnchor="middle">{t2.toFixed(1)}°C</text>
              <text x="0" y="19" fill="#64748b" fontSize="8.5" textAnchor="middle">温度传感器 2</text>
            </g>

            {/* Dimensions Subtitle under Tank 2 */}
            <text x="65" y="244" fill="#64748b" fontSize="8.5" textAnchor="middle">
              尺寸: {l2}×{w2}×{h2}mm ({cap2}L)
            </text>
          </g>

          {/* ================= FLOW DIRECTION ARROWS ON THE SINGLE PIPE ================= */}
          {isForward ? (
            /* Forward (Left -> Right: 1 -> 2) */
            <>
              <polygon points="250,170 265,175 250,180" fill="#0284c7" opacity={isPumpOn ? 0.95 : 0.3} />
              <polygon points="410,170 425,175 410,180" fill="#0284c7" opacity={isPumpOn ? 0.95 : 0.3} />
              <polygon points="575,170 590,175 575,180" fill="#0284c7" opacity={isPumpOn ? 0.95 : 0.3} />
              <polygon points="745,170 760,175 745,180" fill="#0284c7" opacity={isPumpOn ? 0.95 : 0.3} />
            </>
          ) : (
            /* Reverse (Right -> Left: 2 -> 1) */
            <>
              <polygon points="760,170 745,175 760,180" fill="#4f46e5" opacity={isPumpOn ? 0.95 : 0.3} />
              <polygon points="590,170 575,175 590,180" fill="#4f46e5" opacity={isPumpOn ? 0.95 : 0.3} />
              <polygon points="425,170 410,175 425,180" fill="#4f46e5" opacity={isPumpOn ? 0.95 : 0.3} />
              <polygon points="265,170 250,175 265,180" fill="#4f46e5" opacity={isPumpOn ? 0.95 : 0.3} />
            </>
          )}
        </svg>
      </div>
    </div>
  );
};
