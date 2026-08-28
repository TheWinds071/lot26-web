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

  const temp = telemetry?.temperature ?? 0;
  const press = telemetry?.pressure ?? 0;
  const flow = telemetry?.flow_rate ?? 0;

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
              水循环管路拓扑仿真
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              Digital Twin Pipeline & Real-Time Flow Dynamics
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
            水流动态: {isPumpOn ? `${flow.toFixed(1)} L/min (流动中)` : '静态'}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
              isHeaterOn
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            加热状态: {isHeaterOn ? `输出 ${heaterPower}%` : '待机'}
          </span>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <svg
          viewBox="0 0 920 340"
          className="w-full h-auto min-w-[640px] block"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Water flow gradient */}
            <linearGradient id="corpWaterFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="40%" stopColor="#0284c7" />
              <stop offset="60%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>

            <style>
              {`
                @keyframes corpFlowDash {
                  from { stroke-dashoffset: 80; }
                  to { stroke-dashoffset: 0; }
                }
                .corp-flowing-water {
                  animation: ${isPumpOn ? `corpFlowDash ${flowAnimDuration}s linear infinite` : 'none'};
                }
                @keyframes corpPumpRotate {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                .corp-pump-impeller {
                  transform-origin: 220px 220px;
                  animation: ${isPumpOn ? `corpPumpRotate ${Math.max(0.4, 2.0 - (pumpSpeed / 100) * 1.5)}s linear infinite` : 'none'};
                }
              `}
            </style>
          </defs>

          {/* MAIN PIPELINE BACKDROP (Outer Pipe) */}
          <path
            d="M 120 180 L 120 220 L 360 220 L 520 220 L 760 220 L 760 100 L 120 100 L 120 140"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="26"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 120 180 L 120 220 L 360 220 L 520 220 L 760 220 L 760 100 L 120 100 L 120 140"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* FLOWING WATER STREAM WITH REAL FLOW VELOCITY */}
          <path
            d="M 120 180 L 120 220 L 360 220 L 520 220 L 760 220 L 760 100 L 120 100 L 120 140"
            fill="none"
            stroke={isHeaterOn ? "url(#corpWaterFlowGrad)" : "#0284c7"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="14 10"
            className="corp-flowing-water"
            opacity={isPumpOn ? "0.9" : "0.3"}
          />

          {/* 1. RESERVOIR / WATER TANK (Left) */}
          <g transform="translate(60, 100)">
            <rect x="0" y="0" width="100" height="130" rx="10" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <rect x="8" y="25" width="84" height="95" rx="6" fill="#e0f2fe" opacity="0.8" />
            <path d="M 10 38 Q 30 32, 50 38 T 90 38 L 90 120 L 10 120 Z" fill="#38bdf8" opacity="0.7" />
            <text x="50" y="75" fill="#0f172a" fontSize="12" fontWeight="600" textAnchor="middle">储水循环箱</text>
            <text x="50" y="94" fill="#0284c7" fontSize="11" fontWeight="500" textAnchor="middle">Reservoir</text>
          </g>

          {/* 2. CENTRIFUGAL WATER PUMP (Middle Left) */}
          <g transform="translate(0, 0)">
            {/* Pump Housing */}
            <circle cx="220" cy="220" r="32" fill="#ffffff" stroke="#2563eb" strokeWidth="3" />
            {/* Rotating Impeller */}
            <g className="corp-pump-impeller">
              <line x1="220" y1="195" x2="220" y2="245" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <line x1="195" y1="220" x2="245" y2="220" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <circle cx="220" cy="220" r="8" fill="#1d4ed8" />
            </g>
            <rect x="175" y="260" width="90" height="24" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
            <text x="220" y="276" fill="#1e293b" fontSize="11" fontWeight="600" textAnchor="middle">
              水泵: {isPumpOn ? `${pumpSpeed}%` : 'OFF'}
            </text>
          </g>

          {/* 3. PRESSURE SENSOR NODE (Gauge) */}
          <g transform="translate(350, 160)">
            <line x1="10" y1="60" x2="10" y2="30" stroke="#94a3b8" strokeWidth="3" />
            <circle cx="10" cy="20" r="24" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
            <text x="10" y="18" fill="#0284c7" fontSize="11" fontWeight="bold" textAnchor="middle">{press.toFixed(2)}</text>
            <text x="10" y="30" fill="#64748b" fontSize="9" textAnchor="middle">MPa</text>
            <text x="10" y="-8" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">压力传感器</text>
          </g>

          {/* 4. HEATING CHAMBER (Middle Right) */}
          <g transform="translate(480, 175)">
            <rect
              x="0"
              y="10"
              width="110"
              height="70"
              rx="8"
              fill="#ffffff"
              stroke={isHeaterOn ? "#f97316" : "#cbd5e1"}
              strokeWidth="2.5"
            />
            {/* Heating coils */}
            <path
              d="M 20 45 Q 35 25, 50 45 T 80 45"
              fill="none"
              stroke={isHeaterOn ? "#ef4444" : "#94a3b8"}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <text x="55" y="65" fill={isHeaterOn ? "#c2410c" : "#64748b"} fontSize="11" fontWeight="600" textAnchor="middle">
              {isHeaterOn ? `加热中 ${heaterPower}%` : '加热器 待机'}
            </text>
            <text x="55" y="-5" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">加热模块</text>
          </g>

          {/* 5. TEMPERATURE SENSOR NODE */}
          <g transform="translate(650, 160)">
            <line x1="10" y1="60" x2="10" y2="30" stroke="#94a3b8" strokeWidth="3" />
            <circle cx="10" cy="20" r="24" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
            <text x="10" y="18" fill="#d97706" fontSize="11" fontWeight="bold" textAnchor="middle">{temp.toFixed(1)}</text>
            <text x="10" y="30" fill="#64748b" fontSize="9" textAnchor="middle">°C</text>
            <text x="10" y="-8" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">水温传感器</text>
          </g>

          {/* 6. FLOW RATE METER (Top Return Line) */}
          <g transform="translate(420, 60)">
            <rect x="0" y="15" width="80" height="50" rx="6" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
            <text x="40" y="38" fill="#059669" fontSize="12" fontWeight="bold" textAnchor="middle">{flow.toFixed(1)}</text>
            <text x="40" y="52" fill="#64748b" fontSize="10" textAnchor="middle">L/min</text>
            <text x="40" y="0" fill="#334155" fontSize="11" fontWeight="600" textAnchor="middle">电磁流量计</text>
          </g>

          {/* Directional Flow Arrows */}
          <polygon points="280,215 295,220 280,225" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
          <polygon points="610,215 625,220 610,225" fill={isHeaterOn ? "#f97316" : "#0284c7"} opacity={isPumpOn ? 0.9 : 0.3} />
          <polygon points="560,105 545,100 560,95" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
          <polygon points="280,105 265,100 280,95" fill="#0284c7" opacity={isPumpOn ? 0.9 : 0.3} />
        </svg>
      </div>
    </div>
  );
};
