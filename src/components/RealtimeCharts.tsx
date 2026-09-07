import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { TelemetryData } from '../types';

interface RealtimeChartsProps {
  history: TelemetryData[];
}

const formatTime = (ts?: string, index?: number): string => {
  if (!ts) return index !== undefined ? `#${index + 1}` : '';
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toTimeString().slice(0, 8);
    }
  } catch {
    // fallback
  }
  if (ts.length >= 19 && ts.includes('T')) {
    return ts.slice(11, 19);
  }
  return ts;
};

interface SingleChartProps {
  dataKey: 'temp_tank1' | 'temp_tank2' | 'pressure' | 'flow_rate';
  color: string;
  unit: string;
  title: string;
  minVal: number;
  maxVal: number;
  dataPoints: TelemetryData[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

const SingleChartItem: React.FC<SingleChartProps> = ({
  dataKey,
  color,
  unit,
  title,
  minVal,
  maxVal,
  dataPoints,
  width,
  height,
  padding,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (dataPoints.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-gray-500 bg-slate-50 rounded-xl border border-slate-200">
        <p>暂无时序数据，等待 TCP 采集流...</p>
      </div>
    );
  }

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = dataPoints.map((d) => d[dataKey] ?? d.temperature ?? 0);
  const actualMin = Math.min(...values, minVal);
  const actualMax = Math.max(...values, maxVal);
  const range = actualMax - actualMin || 1;

  const getX = (index: number) =>
    padding.left + (index / Math.max(1, dataPoints.length - 1)) * chartWidth;
  const getY = (val: number) =>
    padding.top + chartHeight - ((val - actualMin) / range) * chartHeight;

  const points = dataPoints
    .map((d, i) => `${getX(i)},${getY(d[dataKey] ?? d.temperature ?? 0)}`)
    .join(' ');

  const areaPath = `
    M ${getX(0)} ${getY(dataPoints[0][dataKey] ?? dataPoints[0].temperature ?? 0)}
    L ${points}
    L ${getX(dataPoints.length - 1)} ${padding.top + chartHeight}
    L ${getX(0)} ${padding.top + chartHeight}
    Z
  `;

  const latestVal =
    dataPoints[dataPoints.length - 1][dataKey] ??
    dataPoints[dataPoints.length - 1].temperature ??
    0;

  const handlePointerMove = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    if (svgX < padding.left - 15 || svgX > width - padding.right + 15) {
      setHoverIndex(null);
      return;
    }

    const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
    const ratio = (clampedX - padding.left) / chartWidth;
    const index = Math.round(ratio * (dataPoints.length - 1));
    setHoverIndex(Math.max(0, Math.min(dataPoints.length - 1, index)));
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    handlePointerMove(e.clientX, e.currentTarget);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches[0]) {
      handlePointerMove(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeIndex = hoverIndex !== null ? hoverIndex : null;
  const hoveredPoint = activeIndex !== null ? dataPoints[activeIndex] : null;
  const hoveredVal =
    hoveredPoint !== null ? hoveredPoint[dataKey] ?? hoveredPoint.temperature ?? 0 : null;
  const displayVal = hoveredVal !== null ? hoveredVal : latestVal;
  const hoveredTime = hoveredPoint ? formatTime(hoveredPoint.timestamp, activeIndex!) : '';

  // Tooltip position calculations
  const tooltipW = 100;
  const tooltipH = 46;
  let tooltipX = 0;
  let tooltipY = 0;
  let activePointX = 0;
  let activePointY = 0;

  if (activeIndex !== null && hoveredVal !== null) {
    activePointX = getX(activeIndex);
    activePointY = getY(hoveredVal);
    const isRightSide = activePointX + tooltipW + 12 > width - padding.right;
    tooltipX = isRightSide ? activePointX - tooltipW - 10 : activePointX + 10;
    tooltipY = Math.max(
      padding.top,
      Math.min(padding.top + chartHeight - tooltipH, activePointY - tooltipH / 2)
    );
  }

  return (
    <div
      key={dataKey}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-200 hover:shadow-xs"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color }}
          ></span>
          <span className="text-xs font-semibold text-gray-800">{title}</span>
          {hoverIndex !== null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
              悬停: {hoveredTime}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold font-mono text-gray-900 transition-colors">
            {displayVal.toFixed(dataKey === 'pressure' ? 2 : 1)}
          </span>
          <span className="text-xs text-gray-500 font-normal">{unit}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseLeave}
      >
        <defs>
          <linearGradient id={`corp-grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
          <filter id={`tooltip-shadow-${dataKey}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
          </filter>
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
                {val.toFixed(dataKey === 'pressure' ? 2 : 0)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#corp-grad-${dataKey})`} />

        {/* Line stroke */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />

        {/* Latest point circle (when not hovering) */}
        {dataPoints.length > 0 && hoverIndex === null && (
          <circle
            cx={getX(dataPoints.length - 1)}
            cy={getY(latestVal)}
            r="4"
            fill={color}
            stroke="#ffffff"
            strokeWidth="2"
          />
        )}

        {/* Interactive capture overlay */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="transparent"
          className="cursor-crosshair"
        />

        {/* Hover elements: guide line, marker, and tooltip */}
        {activeIndex !== null && hoveredVal !== null && (
          <g pointerEvents="none">
            {/* Vertical crosshair line */}
            <line
              x1={activePointX}
              y1={padding.top}
              x2={activePointX}
              y2={padding.top + chartHeight}
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.85"
            />

            {/* Hover marker circle on the line */}
            <circle
              cx={activePointX}
              cy={activePointY}
              r="8"
              fill={color}
              opacity="0.25"
            />
            <circle
              cx={activePointX}
              cy={activePointY}
              r="4.5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Floating Tooltip Box */}
            <g transform={`translate(${tooltipX}, ${tooltipY})`}>
              <rect
                width={tooltipW}
                height={tooltipH}
                rx="6"
                ry="6"
                fill="#0f172a"
                stroke="#334155"
                strokeWidth="1"
                filter={`url(#tooltip-shadow-${dataKey})`}
              />
              {/* Tooltip Timestamp */}
              <text
                x="8"
                y="15"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                {hoveredTime}
              </text>
              {/* Tooltip Value */}
              <circle cx="12" cy="30" r="3.5" fill={color} />
              <text
                x="20"
                y="34"
                fill="#f8fafc"
                fontSize="12"
                fontWeight="bold"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                {hoveredVal.toFixed(dataKey === 'pressure' ? 2 : 1)} {unit}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};

interface DualTempChartProps {
  dataPoints: TelemetryData[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

const DualTempChartItem: React.FC<DualTempChartProps> = ({
  dataPoints,
  width,
  height,
  padding,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const points1 = dataPoints
    .map((d, i) => `${getX(i)},${getY(d.temp_tank1 ?? d.temperature ?? 0)}`)
    .join(' ');
  const points2 = dataPoints
    .map((d, i) => `${getX(i)},${getY(d.temp_tank2 ?? d.temperature ?? 0)}`)
    .join(' ');

  const latest1 = t1Vals[t1Vals.length - 1];
  const latest2 = t2Vals[t2Vals.length - 1];

  const handlePointerMove = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    if (svgX < padding.left - 15 || svgX > width - padding.right + 15) {
      setHoverIndex(null);
      return;
    }

    const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
    const ratio = (clampedX - padding.left) / chartWidth;
    const index = Math.round(ratio * (dataPoints.length - 1));
    setHoverIndex(Math.max(0, Math.min(dataPoints.length - 1, index)));
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    handlePointerMove(e.clientX, e.currentTarget);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches[0]) {
      handlePointerMove(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeIndex = hoverIndex !== null ? hoverIndex : null;
  const hoveredPoint = activeIndex !== null ? dataPoints[activeIndex] : null;
  const hovered1 =
    hoveredPoint ? hoveredPoint.temp_tank1 ?? hoveredPoint.temperature ?? 0 : latest1;
  const hovered2 =
    hoveredPoint ? hoveredPoint.temp_tank2 ?? hoveredPoint.temperature ?? 0 : latest2;
  const hoveredTime = hoveredPoint ? formatTime(hoveredPoint.timestamp, activeIndex!) : '';
  const currentDiff = Math.abs(hovered1 - hovered2);

  const tooltipW = 125;
  const tooltipH = 58;
  let tooltipX = 0;
  let tooltipY = 0;
  let activePointX = 0;
  let activePointY1 = 0;
  let activePointY2 = 0;

  if (activeIndex !== null && hoveredPoint) {
    activePointX = getX(activeIndex);
    activePointY1 = getY(hovered1);
    activePointY2 = getY(hovered2);
    const isRightSide = activePointX + tooltipW + 12 > width - padding.right;
    tooltipX = isRightSide ? activePointX - tooltipW - 10 : activePointX + 10;
    const midY = (activePointY1 + activePointY2) / 2;
    tooltipY = Math.max(
      padding.top,
      Math.min(padding.top + chartHeight - tooltipH, midY - tooltipH / 2)
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-200 hover:shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-800">双水槽温度对比</span>
          {hoverIndex !== null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
              悬停: {hoveredTime}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> 水槽1:{' '}
            {hovered1.toFixed(1)}°C
          </span>
          <span className="flex items-center gap-1 text-[11px] text-orange-700">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span> 水槽2:{' '}
            {hovered2.toFixed(1)}°C
          </span>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          温差: {currentDiff.toFixed(1)}°C
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseLeave}
      >
        <defs>
          <filter id="tooltip-shadow-dual" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
          </filter>
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

        {/* End points when not hovering */}
        {hoverIndex === null && (
          <>
            <circle
              cx={getX(dataPoints.length - 1)}
              cy={getY(latest1)}
              r="4"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <circle
              cx={getX(dataPoints.length - 1)}
              cy={getY(latest2)}
              r="4"
              fill="#ea580c"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </>
        )}

        {/* Interactive capture overlay */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="transparent"
          className="cursor-crosshair"
        />

        {/* Hover elements: guide line, markers, and tooltip */}
        {activeIndex !== null && hoveredPoint && (
          <g pointerEvents="none">
            {/* Vertical crosshair line */}
            <line
              x1={activePointX}
              y1={padding.top}
              x2={activePointX}
              y2={padding.top + chartHeight}
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.85"
            />

            {/* Tank 1 Point Marker */}
            <circle
              cx={activePointX}
              cy={activePointY1}
              r="7"
              fill="#f59e0b"
              opacity="0.25"
            />
            <circle
              cx={activePointX}
              cy={activePointY1}
              r="4.5"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Tank 2 Point Marker */}
            <circle
              cx={activePointX}
              cy={activePointY2}
              r="7"
              fill="#ea580c"
              opacity="0.25"
            />
            <circle
              cx={activePointX}
              cy={activePointY2}
              r="4.5"
              fill="#ea580c"
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Floating Dual Tooltip Box */}
            <g transform={`translate(${tooltipX}, ${tooltipY})`}>
              <rect
                width={tooltipW}
                height={tooltipH}
                rx="6"
                ry="6"
                fill="#0f172a"
                stroke="#334155"
                strokeWidth="1"
                filter="url(#tooltip-shadow-dual)"
              />
              <text
                x="8"
                y="14"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                {hoveredTime}
              </text>
              <circle cx="12" cy="27" r="3" fill="#f59e0b" />
              <text
                x="20"
                y="31"
                fill="#f8fafc"
                fontSize="11"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                水槽1: {hovered1.toFixed(1)}°C
              </text>
              <circle cx="12" cy="43" r="3" fill="#ea580c" />
              <text
                x="20"
                y="47"
                fill="#f8fafc"
                fontSize="11"
                fontFamily="ui-monospace, Consolas, monospace"
              >
                水槽2: {hovered2.toFixed(1)}°C
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};

export const RealtimeCharts: React.FC<RealtimeChartsProps> = ({ history }) => {
  const [activeTab, setActiveTab] = useState<'all' | 't1' | 't2' | 'pressure' | 'flow'>('all');

  const dataPoints = history.slice(-40);
  const width = 800;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };

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
        {activeTab === 'all' && (
          <DualTempChartItem
            dataPoints={dataPoints}
            width={width}
            height={height}
            padding={padding}
          />
        )}
        {activeTab === 't1' && (
          <SingleChartItem
            dataKey="temp_tank1"
            color="#d97706"
            unit="°C"
            title="水槽1水温趋势 (°C)"
            minVal={20}
            maxVal={80}
            dataPoints={dataPoints}
            width={width}
            height={height}
            padding={padding}
          />
        )}
        {activeTab === 't2' && (
          <SingleChartItem
            dataKey="temp_tank2"
            color="#ea580c"
            unit="°C"
            title="水槽2水温趋势 (°C)"
            minVal={20}
            maxVal={80}
            dataPoints={dataPoints}
            width={width}
            height={height}
            padding={padding}
          />
        )}

        {(activeTab === 'all' || activeTab === 'pressure') && (
          <SingleChartItem
            dataKey="pressure"
            color="#0284c7"
            unit="MPa"
            title="管道压力趋势 (MPa)"
            minVal={0.0}
            maxVal={0.8}
            dataPoints={dataPoints}
            width={width}
            height={height}
            padding={padding}
          />
        )}

        {(activeTab === 'all' || activeTab === 'flow') && (
          <SingleChartItem
            dataKey="flow_rate"
            color="#059669"
            unit="L/min"
            title="槽间循环流量趋势 (L/min)"
            minVal={0.0}
            maxVal={35}
            dataPoints={dataPoints}
            width={width}
            height={height}
            padding={padding}
          />
        )}
      </div>
    </div>
  );
};
