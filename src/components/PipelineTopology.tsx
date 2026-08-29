import React from 'react';
import { Waves } from 'lucide-react';
import type { DeviceState, TelemetryData } from '../types';

interface PipelineTopologyProps {
  telemetry?: TelemetryData;
  deviceState?: DeviceState;
}

export const PipelineTopology: React.FC<PipelineTopologyProps> = ({
  telemetry,
  deviceState,
}) => {
  const isPumpOn = deviceState?.pump_active && !deviceState?.emergency_stop;
  const isHeaterOn = deviceState?.heater_active && !deviceState?.emergency_stop;
  const pumpSpeed = deviceState?.pump_speed ?? 0;
  const heaterPower = deviceState?.heater_power ?? 0;

  const t1 = telemetry?.temp_tank1 ?? telemetry?.temperature ?? 0;
  const t2 = telemetry?.temp_tank2 ?? telemetry?.temperature ?? 0;
  const press = telemetry?.pressure ?? 0;
  const flow = telemetry?.flow_rate ?? 0;

  const lvl1 = telemetry?.water_level_tank1 ?? 78.0;
  const lvl2 = telemetry?.water_level_tank2 ?? 62.0;

  // Animation speed based on flow rate / pump
  const flowAnimDuration = isPumpOn && flow > 0.5 ? Math.max(0.5, 4.0 - (flow / 30) * 3.0) : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <Waves className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              双水槽循环管路拓扑仿真 (Digital Twin)
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              Dual-Tank Water Circulation, Inter-tank Pump Transfer & Dual Temp Sensing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
              isPumpOn
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            槽间流速: {isPumpOn ? `${flow.toFixed(1)} L/min (循环中)` : '静态停滞'}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
              isHeaterOn
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            加热模块: {isHeaterOn ? `输出 ${heaterPower}%` : '待机'}
          </span>
        </div>
      </div>

      {/* SVG Dual-Tank Pipeline Canvas */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <svg
          viewBox="0 0 980 360"
          className="w-full h-auto min-w-[720px] block"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Water flow gradient */}
            <linearGradient id="dualTankWaterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="50%" stopColor={isHeaterOn ? "#f59e0b" : "#0284c7"} />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>

            <style>
              {`
                @keyframes dtFlowDash {
                  from { stroke-dashoffset: 80; }
                  to { stroke-dashoffset: 0; }
                }
                .dt-flowing-water {
                  animation: ${isPumpOn ? `dtFlowDash ${flowAnimDuration}s linear infinite` : 'none'};
                }
                @keyframes dtPumpRotate {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                .dt-pump-impeller {
                  transform-origin: 390px 240px;
                  animation: ${isPumpOn ? `dtPumpRotate ${Math.max(0.4, 2.0 - (pumpSpeed / 100) * 1.5)}s linear infinite` : 'none'};
                }
              `}
            </style>
          </defs>

          {/* ================= PIPELINES BETWEEN TANK 1 AND TANK 2 ================= */}
          {/* 1. Lower Supply Pipe (Tank 1 -> Pump -> Flow Meter -> Tank 2) */}
          <path
            d="M 190 240 L 790 240"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="24"
            strokeLinecap="round"
          />
          <path
            d="M 190 240 L 790 240"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Lower Water Stream */}
          <path
            d="M 190 240 L 790 240"
            fill="none"
            stroke={isHeaterOn ? "url(#dualTankWaterGrad)" : "#0284c7"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="14 10"
            className="dt-flowing-water"
            opacity={isPumpOn ? "0.9" : "0.25"}
          />

          {/* 2. Upper Return Pipe (Tank 2 -> Tank 1 Return Loop) */}
          <path
            d="M 790 120 L 190 120"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="24"
            strokeLinecap="round"
          />
          <path
            d="M 790 120 L 190 120"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Upper Return Water Stream */}
          <path
            d="M 790 120 L 190 120"
            fill="none"
            stroke="#0284c7"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="14 10"
            className="dt-flowing-water"
            opacity={isPumpOn ? "0.9" : "0.25"}
          />

          {/* ================= TANK 1 (Left Tank: 供水与主控水槽) ================= */}
          <g transform="translate(60, 70)">
            {/* Tank Shell */}
            <rect x="0" y="0" width="130" height="210" rx="12" fill="#ffffff" stroke="#94a3b8" strokeWidth="2.5" />
            {/* Water Volume */}
            <rect x="8" y={200 - (lvl1 / 100) * 180} width="114" height={(lvl1 / 100) * 180} rx="6" fill="#e0f2fe" opacity="0.8" />
            <path
              d={`M 10 ${205 - (lvl1 / 100) * 180} Q 40 ${198 - (lvl1 / 100) * 180}, 70 ${205 - (lvl1 / 100) * 180} T 120 ${205 - (lvl1 / 100) * 180} L 120 195 L 10 195 Z`}
              fill="#38bdf8"
              opacity="0.6"
            />
            {/* Tank Titles */}
            <text x="65" y="40" fill="#0f172a" fontSize="13" fontWeight="bold" textAnchor="middle">水槽 1 (Tank A)</text>
            <text x="65" y="58" fill="#0284c7" fontSize="11" fontWeight="500" textAnchor="middle">主供水/加热槽</text>

            {/* Heating Element Inside Tank 1 */}
            <g transform="translate(25, 145)">
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
                {isHeaterOn ? `加热 ${heaterPower}%` : '加热器 待机'}
              </text>
            </g>

            {/* Temp Sensor 1 Probe */}
            <g transform="translate(105, -30)">
              <line x1="0" y1="30" x2="0" y2="80" stroke="#f59e0b" strokeWidth="3" strokeDasharray="3 2" />
              <rect x="-35" y="-10" width="70" height="36" rx="6" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
              <text x="0" y="8" fill="#d97706" fontSize="11" fontWeight="bold" textAnchor="middle">{t1.toFixed(1)}°C</text>
              <text x="0" y="20" fill="#64748b" fontSize="9" textAnchor="middle">温度传感器 1</text>
            </g>
          </g>

          {/* ================= INTER-TANK ACTUATORS & SENSORS ================= */}

          {/* 1. Inter-tank Circulation Water Pump */}
          <g transform="translate(0, 0)">
            <circle cx="390" cy="240" r="30" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
            <g className="dt-pump-impeller">
              <line x1="390" y1="216" x2="390" y2="264" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <line x1="366" y1="240" x2="414" y2="240" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <circle cx="390" cy="240" r="8" fill="#1d4ed8" />
            </g>
            <rect x="345" y="278" width="90" height="24" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
            <text x="390" y="294" fill="#1e293b" fontSize="11" fontWeight="600" textAnchor="middle">
              水泵: {isPumpOn ? `${pumpSpeed}%` : '已停止'}
            </text>
          </g>

          {/* 2. Pipe Pressure Sensor */}
          <g transform="translate(490, 185)">
            <line x1="20" y1="55" x2="20" y2="30" stroke="#94a3b8" strokeWidth="3" />
            <circle cx="20" cy="18" r="22" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
            <text x="20" y="16" fill="#0284c7" fontSize="11" fontWeight="bold" textAnchor="middle">{press.toFixed(2)}</text>
            <text x="20" y="27" fill="#64748b" fontSize="9" textAnchor="middle">MPa</text>
            <text x="20" y="-8" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">管道压力传感器</text>
          </g>

          {/* 3. Flow Rate Meter */}
          <g transform="translate(610, 205)">
            <rect x="0" y="10" width="80" height="50" rx="6" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
            <text x="40" y="32" fill="#059669" fontSize="12" fontWeight="bold" textAnchor="middle">{flow.toFixed(1)}</text>
            <text x="40" y="46" fill="#64748b" fontSize="10" textAnchor="middle">L/min</text>
            <text x="40" y="74" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">循环流量计</text>
          </g>

          {/* ================= TANK 2 (Right Tank: 循环与工艺水槽) ================= */}
          <g transform="translate(790, 70)">
            {/* Tank Shell */}
            <rect x="0" y="0" width="130" height="210" rx="12" fill="#ffffff" stroke="#94a3b8" strokeWidth="2.5" />
            {/* Water Volume */}
            <rect x="8" y={200 - (lvl2 / 100) * 180} width="114" height={(lvl2 / 100) * 180} rx="6" fill="#e0f2fe" opacity="0.8" />
            <path
              d={`M 10 ${205 - (lvl2 / 100) * 180} Q 40 ${198 - (lvl2 / 100) * 180}, 70 ${205 - (lvl2 / 100) * 180} T 120 ${205 - (lvl2 / 100) * 180} L 120 195 L 10 195 Z`}
              fill="#38bdf8"
              opacity="0.6"
            />
            {/* Tank Titles */}
            <text x="65" y="40" fill="#0f172a" fontSize="13" fontWeight="bold" textAnchor="middle">水槽 2 (Tank B)</text>
            <text x="65" y="58" fill="#0284c7" fontSize="11" fontWeight="500" textAnchor="middle">工艺/回水循环槽</text>

            {/* Temp Sensor 2 Probe */}
            <g transform="translate(25, -30)">
              <line x1="0" y1="30" x2="0" y2="80" stroke="#ea580c" strokeWidth="3" strokeDasharray="3 2" />
              <rect x="-35" y="-10" width="70" height="36" rx="6" fill="#ffffff" stroke="#ea580c" strokeWidth="2" />
              <text x="0" y="8" fill="#c2410c" fontSize="11" fontWeight="bold" textAnchor="middle">{t2.toFixed(1)}°C</text>
              <text x="0" y="20" fill="#64748b" fontSize="9" textAnchor="middle">温度传感器 2</text>
            </g>
          </g>

          {/* Directional Flow Arrows between the 2 tanks */}
          {/* Lower line: Left to Right (Tank 1 -> Tank 2) */}
          <polygon points="260,235 275,240 260,245" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
          <polygon points="720,235 735,240 720,245" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
          {/* Upper return line: Right to Left (Tank 2 -> Tank 1) */}
          <polygon points="520,125 505,120 520,115" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
          <polygon points="300,125 285,120 300,115" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
        </svg>
      </div>
    </div>
  );
};
