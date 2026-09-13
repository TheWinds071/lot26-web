import React from 'react';
import { Droplets, Flame, Gauge, RotateCw, Thermometer, Waves } from 'lucide-react';
import type { DeviceState, SystemConfigResponse, TelemetryData, ThresholdConfig } from '../types';

interface TelemetryCardsProps {
  telemetry?: TelemetryData;
  deviceState?: DeviceState;
  thresholds?: ThresholdConfig;
  systemConfig?: SystemConfigResponse | null;
}

export const TelemetryCards: React.FC<TelemetryCardsProps> = ({
  telemetry,
  deviceState,
  thresholds,
  systemConfig,
}) => {
  const tank1Cfg = systemConfig?.config?.storage_tank;
  const tank2Cfg = systemConfig?.config?.heating_tank;
  const tank1Name = tank1Cfg?.name || '水槽 1';
  const tank2Name = tank2Cfg?.name || '水槽 2';
  const tank1Label = tank1Cfg?.display_label || '储水槽';
  const tank2Label = tank2Cfg?.display_label || '加热槽';
  const t1 = telemetry?.temp_tank1 ?? telemetry?.temperature ?? 0;
  const t2 = telemetry?.temp_tank2 ?? telemetry?.temperature ?? 0;
  const press = telemetry?.pressure ?? 0;
  const flow = telemetry?.flow_rate ?? 0;
  const tempDiff = Math.abs(t1 - t2);

  const tempMin = thresholds?.temp_min ?? 45;
  const tempMax = thresholds?.temp_max ?? 75;
  const tempTarget = thresholds?.temp_target ?? 55;
  const tempDiffMax = thresholds?.temp_diff_max ?? 15;

  const pressMax = thresholds?.pressure_max ?? 0.8;
  const flowMin = thresholds?.flow_rate_min ?? 5.0;

  const targetVolume = thresholds?.target_volume ?? 10.0;
  const accumulatedVolume = deviceState?.accumulated_volume ?? telemetry?.total_volume ?? 0;
  const isTargetReached = deviceState?.target_volume_reached ?? false;

  const pumpDirection = deviceState?.pump_direction ?? 'FORWARD';
  const isPumpActive = deviceState?.pump_active ?? false;

  // Temperature Status for Tank 1 (Storage Tank)
  let t1StatusText = "正常储水";
  let t1StatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (t1 >= tempMax) {
    t1StatusText = "超温告警";
    t1StatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (t1 < tempMin) {
    t1StatusText = "水温偏低";
    t1StatusClass = "bg-blue-50 text-blue-700 border-blue-200";
  }

  // Temperature Status for Tank 2 (Heating Module Tank)
  let t2StatusText = "正常恒温";
  let t2StatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (t2 >= tempMax) {
    t2StatusText = "超温告警";
    t2StatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (deviceState?.heater_active) {
    t2StatusText = "加热升温中";
    t2StatusClass = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (t2 >= tempTarget) {
    t2StatusText = "恒温达标";
    t2StatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (t2 < tempMin) {
    t2StatusText = "水温偏低";
    t2StatusClass = "bg-blue-50 text-blue-700 border-blue-200";
  }

  // Pressure Status (Pa)
  const effPressMax = pressMax < 10 ? pressMax * 1_000_000 : pressMax;
  let pressStatusText = "压力平稳";
  let pressStatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (press >= effPressMax) {
    pressStatusText = "超压危险";
    pressStatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (press < effPressMax * 0.08) {
    pressStatusText = "低压/待机";
    pressStatusClass = "bg-amber-50 text-amber-700 border-amber-200";
  }

  // Flow Status
  let flowStatusText = isPumpActive
    ? pumpDirection === 'FORWARD'
      ? "正向输送 1➔2"
      : "反向输送 2➔1"
    : "水泵停机";
  let flowStatusClass = isPumpActive
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-slate-100 text-slate-700 border-slate-200";

  const effectiveFlowMin = flowMin > 1.0 && flow <= 1.0 ? 0.02 : flowMin;
  if (isTargetReached) {
    flowStatusText = "定量达标已停泵";
    flowStatusClass = "bg-cyan-50 text-cyan-800 border-cyan-300 font-medium";
  } else if (isPumpActive && flow < effectiveFlowMin) {
    flowStatusText = "流量过低 (防干烧)";
    flowStatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  }

  const t1Percentage = Math.min(100, Math.max(0, (t1 / 100) * 100));
  const t2Percentage = Math.min(100, Math.max(0, (t2 / 100) * 100));
  const pressPercentage = Math.min(100, Math.max(0, (press / effPressMax) * 100));
  // 自适应流量进度条：微流量按 0.40 L/min 满量程，常规流量按 40.0 L/min
  const maxDisplayFlow = flow <= 1.0 ? 0.4 : 40.0;
  const flowPercentage = Math.min(100, Math.max(0, (flow / maxDisplayFlow) * 100));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
      {/* 1. Tank 1 Temperature Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-xs">
              <Thermometer className="w-5 h-5" />
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${t1StatusClass}`}>
              {t1StatusText}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">
            {tank1Name} 水温 ({tank1Label})
          </span>
          <div className="flex items-baseline gap-1.5 mt-1 mb-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
              {t1.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-gray-500">°C</span>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-200"
              style={{ width: `${t1Percentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-normal">
            <span>储水常温</span>
            <span>保护上限: {tempMax}°C</span>
          </div>
        </div>
      </div>

      {/* 2. Tank 2 Temperature Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 border border-orange-200 flex items-center justify-center shadow-xs">
              <Thermometer className="w-5 h-5" />
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${t2StatusClass}`}>
              {t2StatusText}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">
            {tank2Name} 水温 ({tank2Label})
          </span>
          <div className="flex items-baseline gap-1.5 mt-1 mb-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
              {t2.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-gray-500">°C</span>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-200"
              style={{ width: `${t2Percentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-normal">
            <span>槽间温差: {tempDiff.toFixed(1)}°C</span>
            <span className={tempDiff > tempDiffMax ? 'text-amber-600 font-medium' : ''}>
              温差阈值: &le;{tempDiffMax}°C
            </span>
          </div>
        </div>
      </div>

      {/* 3. Single Pipe Pressure Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shadow-xs">
              <Gauge className="w-5 h-5" />
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${pressStatusClass}`}>
              {pressStatusText}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">单管路压力 (Pipe Pressure)</span>
          <div className="flex items-baseline gap-1.5 mt-1 mb-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
              {press >= 10 ? Math.round(press).toLocaleString() : press.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-gray-500">Pa</span>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                press >= effPressMax ? 'bg-rose-600' : 'bg-blue-600'
              }`}
              style={{ width: `${pressPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-normal">
            <span>上限: {effPressMax >= 1000 ? `${(effPressMax / 1000).toFixed(1)} kPa` : `${effPressMax} Pa`}</span>
            <span>约 {(press / 1000).toFixed(2)} kPa</span>
          </div>
        </div>
      </div>

      {/* 4. Single Pipe Flow Rate Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
              <Waves className="w-5 h-5" />
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${flowStatusClass}`}>
              {flowStatusText}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">管道双向流量 (Flow Rate)</span>
          <div className="flex items-baseline justify-between mt-1 mb-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
                {flow.toFixed(2)}
              </span>
              <span className="text-sm font-medium text-gray-500">L/min</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
              <Droplets className="w-3 h-3" />
              <span className="font-mono font-semibold">{accumulatedVolume.toFixed(2)}</span>
              <span className="text-gray-400">/</span>
              <span className="font-mono text-gray-600">{targetVolume.toFixed(1)}L</span>
            </div>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-200"
              style={{ width: `${flowPercentage}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-600 pt-1 border-t border-gray-100">
            <div className="flex items-center gap-1">
              <RotateCw className={`w-3 h-3 ${isPumpActive ? 'text-blue-600 animate-spin' : 'text-gray-400'}`} />
              <span>水泵 {isPumpActive ? `${pumpDirection === 'FORWARD' ? '正转' : '反转'} ${deviceState?.pump_speed}%` : '停止'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Flame className={`w-3 h-3 ${deviceState?.heater_active ? 'text-amber-500 animate-pulse' : 'text-gray-400'}`} />
              <span>加热 {deviceState?.heater_active ? `${deviceState.heater_power}%` : '待机'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
