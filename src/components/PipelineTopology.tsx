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
    <div className="topology-card">
      <div className="topology-header">
        <div className="section-title-group">
          <Waves className="section-title-icon" size={20} />
          <h3>水循环拓扑与管路实时工况</h3>
        </div>
        <div className="topology-status-tags">
          <span className={`tag-pill ${isPumpOn ? 'pill-active' : 'pill-inactive'}`}>
            水流动态: {isPumpOn ? `${flow.toFixed(1)} L/min (${flowAnimDuration > 0 ? '流动中' : '静态'})` : '停滞'}
          </span>
          <span className={`tag-pill ${isHeaterOn ? 'pill-heating' : 'pill-inactive'}`}>
            加热功率: {isHeaterOn ? `${heaterPower}%` : '待机'}
          </span>
        </div>
      </div>

      <div className="topology-canvas-wrapper">
        <svg
          viewBox="0 0 920 340"
          className="topology-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Water pipe gradient */}
            <linearGradient id="pipeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            {/* Heated water gradient */}
            <linearGradient id="waterFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="40%" stopColor="#38bdf8" />
              <stop offset="60%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>

            {/* Heater Glow Filter */}
            <filter id="heaterGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Water Pulse Animation */}
            <style>
              {`
                @keyframes flowDash {
                  from { stroke-dashoffset: 80; }
                  to { stroke-dashoffset: 0; }
                }
                .flowing-water {
                  animation: ${isPumpOn ? `flowDash ${flowAnimDuration}s linear infinite` : 'none'};
                }
                @keyframes pumpRotate {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                .pump-impeller {
                  transform-origin: 220px 220px;
                  animation: ${isPumpOn ? `pumpRotate ${Math.max(0.4, 2.0 - (pumpSpeed / 100) * 1.5)}s linear infinite` : 'none'};
                }
              `}
            </style>
          </defs>

          {/* MAIN PIPELINE BACKDROP (Outer Pipe) */}
          <path
            d="M 120 180 L 120 220 L 360 220 L 520 220 L 760 220 L 760 100 L 120 100 L 120 140"
            fill="none"
            stroke="#1e293b"
            strokeWidth="28"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 120 180 L 120 220 L 360 220 L 520 220 L 760 220 L 760 100 L 120 100 L 120 140"
            fill="none"
            stroke="#0f172a"
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* FLOWING WATER STREAM WITH REAL FLOW VELOCITY */}
          <path
            d="M 120 180 L 120 220 L 360 220 L 520 220 L 760 220 L 760 100 L 120 100 L 120 140"
            fill="none"
            stroke={isHeaterOn ? "url(#waterFlowGrad)" : "#0ea5e9"}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="14 10"
            className="flowing-water"
            opacity={isPumpOn ? "0.9" : "0.25"}
          />

          {/* 1. RESERVOIR / WATER TANK (Left) */}
          <g transform="translate(60, 110)">
            <rect x="0" y="0" width="100" height="120" rx="10" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
            <rect x="8" y="25" width="84" height="85" rx="6" fill="#0284c7" opacity="0.4" />
            <path d="M 10 35 Q 30 28, 50 35 T 90 35 L 90 110 L 10 110 Z" fill="#38bdf8" opacity="0.6" />
            <text x="50" y="70" fill="#f8fafc" fontSize="13" fontWeight="bold" textAnchor="middle">储水循环箱</text>
            <text x="50" y="88" fill="#bae6fd" fontSize="11" textAnchor="middle">Reservoir</text>
          </g>

          {/* 2. CENTRIFUGAL WATER PUMP (Middle Left) */}
          <g transform="translate(0, 0)">
            {/* Pump Housing */}
            <circle cx="220" cy="220" r="32" fill="#0f172a" stroke="#3b82f6" strokeWidth="4" />
            {/* Rotating Impeller */}
            <g className="pump-impeller">
              <line x1="220" y1="195" x2="220" y2="245" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" />
              <line x1="195" y1="220" x2="245" y2="220" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" />
              <circle cx="220" cy="220" r="8" fill="#3b82f6" />
            </g>
            <rect x="175" y="260" width="90" height="24" rx="6" fill="#1e293b" stroke="#3b82f6" strokeWidth="1" />
            <text x="220" y="276" fill="#93c5fd" fontSize="11" fontWeight="bold" textAnchor="middle">
              水泵: {isPumpOn ? `${pumpSpeed}%` : 'OFF'}
            </text>
          </g>

          {/* 3. PRESSURE SENSOR NODE (Gauge) */}
          <g transform="translate(350, 160)">
            <line x1="10" y1="60" x2="10" y2="30" stroke="#64748b" strokeWidth="4" />
            <circle cx="10" cy="20" r="24" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
            <text x="10" y="18" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle">{press.toFixed(2)}</text>
            <text x="10" y="30" fill="#94a3b8" fontSize="9" textAnchor="middle">MPa</text>
            <text x="10" y="-10" fill="#cbd5e1" fontSize="11" fontWeight="500" textAnchor="middle">压力变送器</text>
          </g>

          {/* 4. HEATING CHAMBER (Middle Right) */}
          <g transform="translate(480, 175)">
            <rect
              x="0"
              y="10"
              width="110"
              height="70"
              rx="8"
              fill="#0f172a"
              stroke={isHeaterOn ? "#f97316" : "#475569"}
              strokeWidth="3"
              filter={isHeaterOn ? "url(#heaterGlow)" : undefined}
            />
            {/* Heating coils */}
            <path
              d="M 20 45 Q 35 25, 50 45 T 80 45"
              fill="none"
              stroke={isHeaterOn ? "#ef4444" : "#64748b"}
              strokeWidth="4"
              strokeLinecap="round"
            />
            <text x="55" y="65" fill={isHeaterOn ? "#fdba74" : "#94a3b8"} fontSize="12" fontWeight="bold" textAnchor="middle">
              {isHeaterOn ? `加热中 ${heaterPower}%` : '加热器 待机'}
            </text>
            <text x="55" y="-5" fill="#cbd5e1" fontSize="11" fontWeight="500" textAnchor="middle">加热模块</text>
          </g>

          {/* 5. TEMPERATURE SENSOR NODE */}
          <g transform="translate(650, 160)">
            <line x1="10" y1="60" x2="10" y2="30" stroke="#64748b" strokeWidth="4" />
            <circle cx="10" cy="20" r="24" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
            <text x="10" y="18" fill="#f59e0b" fontSize="11" fontWeight="bold" textAnchor="middle">{temp.toFixed(1)}</text>
            <text x="10" y="30" fill="#94a3b8" fontSize="9" textAnchor="middle">°C</text>
            <text x="10" y="-10" fill="#cbd5e1" fontSize="11" fontWeight="500" textAnchor="middle">水温传感器</text>
          </g>

          {/* 6. FLOW RATE METER (Top Return Line) */}
          <g transform="translate(420, 60)">
            <rect x="0" y="15" width="80" height="50" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
            <text x="40" y="38" fill="#10b981" fontSize="12" fontWeight="bold" textAnchor="middle">{flow.toFixed(1)}</text>
            <text x="40" y="52" fill="#94a3b8" fontSize="10" textAnchor="middle">L/min</text>
            <text x="40" y="0" fill="#cbd5e1" fontSize="11" fontWeight="500" textAnchor="middle">电磁流量计</text>
          </g>

          {/* Directional Flow Arrows */}
          <polygon points="280,215 295,220 280,225" fill="#38bdf8" opacity={isPumpOn ? 0.9 : 0.2} />
          <polygon points="610,215 625,220 610,225" fill={isHeaterOn ? "#f97316" : "#38bdf8"} opacity={isPumpOn ? 0.9 : 0.2} />
          <polygon points="560,105 545,100 560,95" fill="#38bdf8" opacity={isPumpOn ? 0.9 : 0.2} />
          <polygon points="280,105 265,100 280,95" fill="#38bdf8" opacity={isPumpOn ? 0.9 : 0.2} />
        </svg>
      </div>
    </div>
  );
};
