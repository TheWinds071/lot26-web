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
  let tempStatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (temp < tempMin) {
    tempStatusText = "水温偏低 (加热中)";
    tempStatusClass = "bg-blue-50 text-blue-700 border-blue-200";
  } else if (temp > tempMax) {
    tempStatusText = "超温告警";
    tempStatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  }

  // Pressure Status
  let pressStatusText = "压力平稳";
  let pressStatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (press >= pressMax) {
    pressStatusText = "超压危险";
    pressStatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (press < 0.1) {
    pressStatusText = "低压/待机";
    pressStatusClass = "bg-amber-50 text-amber-700 border-amber-200";
  }

  // Flow Status
  let flowStatusText = "循环畅通";
  let flowStatusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (deviceState?.pump_active && flow < flowMin) {
    flowStatusText = "流量过低 (防干烧)";
    flowStatusClass = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (!deviceState?.pump_active) {
    flowStatusText = "水泵停机";
    flowStatusClass = "bg-slate-100 text-slate-700 border-slate-200";
  }

  const tempPercentage = Math.min(100, Math.max(0, (temp / 100) * 100));
  const pressPercentage = Math.min(100, Math.max(0, (press / 1.0) * 100));
  const flowPercentage = Math.min(100, Math.max(0, (flow / 40.0) * 100));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
      {/* 1. Water Temperature Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-xs">
              <Thermometer className="w-5 h-5" />
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${tempStatusClass}`}>
              {tempStatusText}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">管道水温 (Water Temp)</span>
          <div className="flex items-baseline gap-1.5 mt-1 mb-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
              {temp.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-gray-500">°C</span>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-200"
              style={{ width: `${tempPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-normal">
            <span>目标: {tempTarget}°C</span>
            <span>安全区间: {tempMin} ~ {tempMax}°C</span>
          </div>
        </div>
      </div>

      {/* 2. Pipe Pressure Card */}
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
          <span className="text-xs font-medium text-gray-500 block">管道压力 (Pipe Pressure)</span>
          <div className="flex items-baseline gap-1.5 mt-1 mb-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
              {press.toFixed(2)}
            </span>
            <span className="text-sm font-medium text-gray-500">MPa</span>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                press >= pressMax ? 'bg-rose-600' : 'bg-blue-600'
              }`}
              style={{ width: `${pressPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-normal">
            <span>上限: {pressMax.toFixed(2)} MPa</span>
            <span>约 {(press * 10).toFixed(1)} bar</span>
          </div>
        </div>
      </div>

      {/* 3. Pipe Flow Rate Card */}
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
          <span className="text-xs font-medium text-gray-500 block">循环流量 (Flow Rate)</span>
          <div className="flex items-baseline gap-1.5 mt-1 mb-3">
            <span className="text-3xl font-bold tracking-tight text-gray-900 font-mono">
              {flow.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-gray-500">L/min</span>
          </div>
        </div>

        <div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-200"
              style={{ width: `${flowPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 font-normal">
            <span>保护下限: {flowMin.toFixed(1)} L/min</span>
            <span>流速比: {(flow / 25).toFixed(2)}x</span>
          </div>
        </div>
      </div>

      {/* 4. Actuators State Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              执行机构状态
            </span>
          </div>

          <div className="space-y-2 mb-3">
            {/* Pump */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                <RotateCw
                  className={`w-3.5 h-3.5 ${
                    deviceState?.pump_active ? 'animate-spin text-blue-600' : 'text-gray-400'
                  }`}
                />
                <span>循环水泵</span>
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  deviceState?.pump_active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {deviceState?.pump_active ? `运行中 (${deviceState.pump_speed}%)` : '已停止'}
              </span>
            </div>

            {/* Heater */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                <Flame
                  className={`w-3.5 h-3.5 ${
                    deviceState?.heater_active ? 'text-amber-500 animate-pulse' : 'text-gray-400'
                  }`}
                />
                <span>加热模块</span>
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  deviceState?.heater_active
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {deviceState?.heater_active ? `加热中 (${deviceState.heater_power}%)` : '待机'}
              </span>
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500 font-normal pt-1 border-t border-gray-100 flex items-center justify-between">
          <span>温控联锁</span>
          <span className="text-blue-600 font-medium">闭环保护已就绪</span>
        </div>
      </div>
    </div>
  );
};
