import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { TelemetryData } from '../types';

interface RealtimeChartsProps {
  history: TelemetryData[];
}

export const RealtimeCharts: React.FC<RealtimeChartsProps> = ({ history }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'temp' | 'pressure' | 'flow'>('all');

  const dataPoints = history.slice(-40);
  const width = 800;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };

  // Calculate scales
  const renderChart = (
    key: 'temperature' | 'pressure' | 'flow_rate',
    color: string,
    unit: string,
    title: string,
    minVal: number,
    maxVal: number
  ) => {
    if (dataPoints.length === 0) {
      return (
        <div className="chart-empty">
          <p>暂无时序数据，等待 TCP 采集流...</p>
        </div>
      );
    }

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = dataPoints.map((d) => d[key]);
    const actualMin = Math.min(...values, minVal);
    const actualMax = Math.max(...values, maxVal);
    const range = actualMax - actualMin || 1;

    const getX = (index: number) =>
      padding.left + (index / Math.max(1, dataPoints.length - 1)) * chartWidth;
    const getY = (val: number) =>
      padding.top + chartHeight - ((val - actualMin) / range) * chartHeight;

    const points = dataPoints.map((d, i) => `${getX(i)},${getY(d[key])}`).join(' ');

    const areaPath = `
      M ${getX(0)} ${getY(dataPoints[0][key])}
      L ${points}
      L ${getX(dataPoints.length - 1)} ${padding.top + chartHeight}
      L ${getX(0)} ${padding.top + chartHeight}
      Z
    `;

    const latestVal = dataPoints[dataPoints.length - 1][key];

    return (
      <div className="chart-item-card" key={key}>
        <div className="chart-item-header">
          <div className="chart-item-title">
            <span className="color-dot" style={{ backgroundColor: color }}></span>
            <span>{title}</span>
          </div>
          <div className="chart-item-value">
            <span style={{ color }}>{latestVal.toFixed(key === 'pressure' ? 2 : 1)}</span>
            <span className="unit-label">{unit}</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
          <defs>
            <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
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
                  stroke="#334155"
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
          <path d={areaPath} fill={`url(#grad-${key})`} />

          {/* Line stroke */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Latest point circle */}
          {dataPoints.length > 0 && (
            <circle
              cx={getX(dataPoints.length - 1)}
              cy={getY(latestVal)}
              r="4.5"
              fill={color}
              stroke="#0f172a"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
    );
  };

  return (
    <div className="charts-card">
      <div className="charts-header">
        <div className="section-title-group">
          <TrendingUp className="section-title-icon" size={20} />
          <h3>实时趋势曲线 (40采样窗口)</h3>
        </div>
        <div className="chart-tabs">
          <button
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            综合三联视图
          </button>
          <button
            className={`tab-btn ${activeTab === 'temp' ? 'active' : ''}`}
            onClick={() => setActiveTab('temp')}
          >
            水温曲线
          </button>
          <button
            className={`tab-btn ${activeTab === 'pressure' ? 'active' : ''}`}
            onClick={() => setActiveTab('pressure')}
          >
            压力曲线
          </button>
          <button
            className={`tab-btn ${activeTab === 'flow' ? 'active' : ''}`}
            onClick={() => setActiveTab('flow')}
          >
            流量曲线
          </button>
        </div>
      </div>

      <div className={`charts-grid ${activeTab === 'all' ? 'grid-3-col' : 'grid-1-col'}`}>
        {(activeTab === 'all' || activeTab === 'temp') &&
          renderChart('temperature', '#f59e0b', '°C', '水温变化趋势', 20, 80)}

        {(activeTab === 'all' || activeTab === 'pressure') &&
          renderChart('pressure', '#38bdf8', 'MPa', '管道压力变化趋势', 0.0, 0.8)}

        {(activeTab === 'all' || activeTab === 'flow') &&
          renderChart('flow_rate', '#10b981', 'L/min', '循环流量变化趋势', 0.0, 35)}
      </div>
    </div>
  );
};
