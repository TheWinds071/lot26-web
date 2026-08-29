import React from 'react';
import { ArrowLeftRight, Waves } from 'lucide-react';
import type { DeviceState, TelemetryData } from '../types';

interface PipelineTopologyProps {
  telemetry?: TelemetryData;
  deviceState?: DeviceState;
}

export const PipelineTopology: React.FC<PipelineTopologyProps> = ({
  telemetry,
  deviceState,
}) => {
  const isPumpOn = (deviceState?.pump_active ?? false) && !deviceState?.emergency_stop;
  const pumpDirection = deviceState?.pump_direction ?? 'FORWARD';
  const isForward = pumpDirection === 'FORWARD';
  const isHeaterOn = (deviceState?.heater_active ?? false) && !deviceState?.emergency_stop;
  const pumpSpeed = deviceState?.pump_speed ?? 0;
  const heaterPower = deviceState?.heater_power ?? 0;

  const t1 = telemetry?.temp_tank1 ?? telemetry?.temperature ?? 0;
  const t2 = telemetry?.temp_tank2 ?? telemetry?.temperature ?? 0;
  const press = telemetry?.pressure ?? 0;
  const flow = telemetry?.flow_rate ?? 0;

  const lvl1 = telemetry?.water_level_tank1 ?? 75.0;
  const lvl2 = telemetry?.water_level_tank2 ?? 65.0;

  // Animation duration based on flow rate & pump speed
  const flowAnimDuration = isPumpOn && flow > 0.5 ? Math.max(0.4, 3.5 - (flow / 30) * 2.8) : 0;
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
                ? `正转流向: 水槽1 ➔ 水槽2 (${flow.toFixed(1)} L/min)`
                : `反转流向: 水槽2 ➔ 水槽1 (${flow.toFixed(1)} L/min)`
              : '水泵停止 (流体静止)'}
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
                  from { stroke-dashoffset: 80; }
                  to { stroke-dashoffset: 0; }
                }
                @keyframes flowReverseDash {
                  from { stroke-dashoffset: 0; }
                  to { stroke-dashoffset: 80; }
                }
                .single-pipe-flow {
                  animation: ${
                    isPumpOn
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

          {/* ================= TANK 1 (Left: 储水槽1 / 供水加热) ================= */}
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
            {/* Titles */}
            <text x="65" y="32" fill="#0f172a" fontSize="13" fontWeight="bold" textAnchor="middle">水槽 1 (Tank 1)</text>
            <text x="65" y="48" fill="#0284c7" fontSize="10.5" fontWeight="500" textAnchor="middle">主水槽 / 恒温区</text>

            {/* Heating Element inside Tank 1 */}
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
                {isHeaterOn ? `加热 ${heaterPower}%` : '加热器 待机'}
              </text>
            </g>

            {/* Temperature Sensor 1 Probe */}
            <g transform="translate(105, -25)">
              <line x1="0" y1="25" x2="0" y2="70" stroke="#f59e0b" strokeWidth="3" strokeDasharray="3 2" />
              <rect x="-35" y="-10" width="70" height="34" rx="6" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
              <text x="0" y="8" fill="#d97706" fontSize="11" fontWeight="bold" textAnchor="middle">{t1.toFixed(1)}°C</text>
              <text x="0" y="19" fill="#64748b" fontSize="8.5" textAnchor="middle">温度传感器 1</text>
            </g>
          </g>

          {/* ================= SENSORS & BIDIRECTIONAL PUMP ON THE SINGLE PIPE ================= */}

          {/* 1. Pipe Pressure Sensor (Left side of pump, x = 320) */}
          <g transform="translate(320, 120)">
            <line x1="20" y1="55" x2="20" y2="28" stroke="#94a3b8" strokeWidth="3" />
            <circle cx="20" cy="14" r="22" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
            <text x="20" y="12" fill="#0284c7" fontSize="11" fontWeight="bold" textAnchor="middle">{press.toFixed(2)}</text>
            <text x="20" y="23" fill="#64748b" fontSize="9" textAnchor="middle">MPa</text>
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
          <g transform="translate(630, 140)">
            <rect x="0" y="10" width="84" height="50" rx="6" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
            <text x="42" y="32" fill="#059669" fontSize="12" fontWeight="bold" textAnchor="middle">{flow.toFixed(1)}</text>
            <text x="42" y="46" fill="#64748b" fontSize="10" textAnchor="middle">L/min</text>
            <text x="42" y="74" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">双向流量传感器</text>
          </g>

          {/* ================= TANK 2 (Right: 储水槽2 / 循环受水) ================= */}
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
              fill="#e0f2fe"
              opacity="0.85"
            />
            <path
              d={`M 10 ${225 - (lvl2 / 100) * 195} Q 40 ${218 - (lvl2 / 100) * 195}, 70 ${225 - (lvl2 / 100) * 195} T 120 ${225 - (lvl2 / 100) * 195} L 120 215 L 10 215 Z`}
              fill="#38bdf8"
              opacity="0.6"
            />
            {/* Titles */}
            <text x="65" y="32" fill="#0f172a" fontSize="13" fontWeight="bold" textAnchor="middle">水槽 2 (Tank 2)</text>
            <text x="65" y="48" fill="#0284c7" fontSize="10.5" fontWeight="500" textAnchor="middle">循环水槽 / 反应区</text>

            {/* Temperature Sensor 2 Probe */}
            <g transform="translate(25, -25)">
              <line x1="0" y1="25" x2="0" y2="70" stroke="#ea580c" strokeWidth="3" strokeDasharray="3 2" />
              <rect x="-35" y="-10" width="70" height="34" rx="6" fill="#ffffff" stroke="#ea580c" strokeWidth="2" />
              <text x="0" y="8" fill="#c2410c" fontSize="11" fontWeight="bold" textAnchor="middle">{t2.toFixed(1)}°C</text>
              <text x="0" y="19" fill="#64748b" fontSize="8.5" textAnchor="middle">温度传感器 2</text>
            </g>
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
