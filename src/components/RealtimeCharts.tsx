import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { TelemetryData } from '../types';

interface RealtimeChartsProps {
  history: TelemetryData[];
}

export const RealtimeCharts: React.FC<RealtimeChartsProps> = ({ history }) => {
  const [activeTab, setActiveTab] = useState<'all' | 't1' | 't2' | 'pressure' | 'flow'>('all');

  const dataPoints = history.slice(-40);
  const width = 800;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };

  const renderSingleChart = (
    key: 'temp_tank1' | 'temp_tank2' | 'pressure' | 'flow_rate',
    color: string,
    unit: string,
    title: string,
    minVal: number,
    maxVal: number
  ) => {
    if (dataPoints.length === 0) {
      return (
        <div className="py-12 text-center text-xs text-gray-500 bg-slate-50 rounded-xl border border-slate-200">
          <p>暂无时序数据，等待 TCP 采集流...</p>
        </div>
      );
    }

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = dataPoints.map((d) => d[key] ?? d.temperature ?? 0);
    const actualMin = Math.min(...values, minVal);
    const actualMax = Math.max(...values, maxVal);
    const range = actualMax - actualMin || 1;

    const getX = (index: number) =>
      padding.left + (index / Math.max(1, dataPoints.length - 1)) * chartWidth;
    const getY = (val: number) =>
      padding.top + chartHeight - ((val - actualMin) / range) * chartHeight;

    const points = dataPoints.map((d, i) => `${getX(i)},${getY(d[key] ?? d.temperature ?? 0)}`).join(' ');

    const areaPath = `
      M ${getX(0)} ${getY(dataPoints[0][key] ?? dataPoints[0].temperature ?? 0)}
      L ${points}
      L ${getX(dataPoints.length - 1)} ${padding.top + chartHeight}
      L ${getX(0)} ${padding.top + chartHeight}
      Z
    `;

    const latestVal = dataPoints[dataPoints.length - 1][key] ?? dataPoints[dataPoints.length - 1].temperature ?? 0;

    return (
      <div
        key={key}
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-200"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            ></span>
            <span className="text-xs font-semibold text-gray-800">{title}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold font-mono text-gray-900">
              {latestVal.toFixed(key === 'pressure' ? 2 : 1)}
            </span>
            <span className="text-xs text-gray-500 font-normal">{unit}</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block">
          <defs>
            <linearGradient id={`corp-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padding.top + chartHeight * (1 - pct);
            const val = actualMin + range * pct;
            return (
              <g key={pct}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  fill="#94a3b8"
                  fontSize="10"
                  textAnchor="end"
                >
                  {val.toFixed(key === 'pressure' ? 2 : 0)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill={`url(#corp-grad-${key})`} />

          {/* Line stroke */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Latest point circle */}
          {dataPoints.length > 0 && (
            <circle
              cx={getX(dataPoints.length - 1)}
              cy={getY(latestVal)}
              r="4"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
    );
  };

  // Dual temperature comparative chart
  const renderDualTempChart = () => {
    if (dataPoints.length === 0) return null;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const t1Vals = dataPoints.map((d) => d.temp_tank1 ?? d.temperature ?? 0);
    const t2Vals = dataPoints.map((d) => d.temp_tank2 ?? d.temperature ?? 0);
    const allVals = [...t1Vals, ...t2Vals];
    const actualMin = Math.min(...allVals, 20);
    const actualMax = Math.max(...allVals, 80);
    const range = actualMax - actualMin || 1;

    const getX = (index: number) =>
      padding.left + (index / Math.max(1, dataPoints.length - 1)) * chartWidth;
    const getY = (val: number) =>
      padding.top + chartHeight - ((val - actualMin) / range) * chartHeight;

    const points1 = dataPoints.map((d, i) => `${getX(i)},${getY(d.temp_tank1 ?? d.temperature ?? 0)}`).join(' ');
    const points2 = dataPoints.map((d, i) => `${getX(i)},${getY(d.temp_tank2 ?? d.temperature ?? 0)}`).join(' ');

    const latest1 = t1Vals[t1Vals.length - 1];
    const latest2 = t2Vals[t2Vals.length - 1];

    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-800">双水槽温度对比</span>
            <span className="flex items-center gap-1 text-[11px] text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> 水槽1: {latest1.toFixed(1)}°C
            </span>
            <span className="flex items-center gap-1 text-[11px] text-orange-700">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span> 水槽2: {latest2.toFixed(1)}°C
            </span>
          </div>
          <div className="text-xs text-gray-500">
            温差: {Math.abs(latest1 - latest2).toFixed(1)}°C
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padding.top + chartHeight * (1 - pct);
            const val = actualMin + range * pct;
            return (
              <g key={pct}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  fill="#94a3b8"
                  fontSize="10"
                  textAnchor="end"
                >
                  {val.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Line 1: Tank 1 */}
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            points={points1}
          />
          {/* Line 2: Tank 2 */}
          <polyline
            fill="none"
            stroke="#ea580c"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="6 3"
            points={points2}
          />

          {/* End points */}
          <circle cx={getX(dataPoints.length - 1)} cy={getY(latest1)} r="4" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
          <circle cx={getX(dataPoints.length - 1)} cy={getY(latest2)} r="4" fill="#ea580c" stroke="#ffffff" strokeWidth="2" />
        </svg>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              实时趋势监控
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              Dual-Tank Temperature, Pipe Pressure & Flow Waveforms
            </p>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 flex-wrap">
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === 'all'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('all')}
          >
            综合视图
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === 't1'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('t1')}
          >
            水槽1水温
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === 't2'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('t2')}
          >
            水槽2水温
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === 'pressure'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('pressure')}
          >
            管道压力
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
              activeTab === 'flow'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('flow')}
          >
            循环流量
          </button>
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          activeTab === 'all'
            ? 'grid-cols-1 md:grid-cols-3'
            : 'grid-cols-1'
        }`}
      >
        {activeTab === 'all' && renderDualTempChart()}
        {activeTab === 't1' &&
          renderSingleChart('temp_tank1', '#d97706', '°C', '水槽1水温趋势 (°C)', 20, 80)}
        {activeTab === 't2' &&
          renderSingleChart('temp_tank2', '#ea580c', '°C', '水槽2水温趋势 (°C)', 20, 80)}

        {(activeTab === 'all' || activeTab === 'pressure') &&
          renderSingleChart('pressure', '#0284c7', 'MPa', '管道压力趋势 (MPa)', 0.0, 0.8)}

        {(activeTab === 'all' || activeTab === 'flow') &&
          renderSingleChart('flow_rate', '#059669', 'L/min', '槽间循环流量趋势 (L/min)', 0.0, 35)}
      </div>
    </div>
  );
};
