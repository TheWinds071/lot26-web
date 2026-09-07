import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  MoveHorizontal,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  TrendingUp,
} from 'lucide-react';
import type { TelemetryData } from '../types';

interface RealtimeChartsProps {
  history: TelemetryData[];
  isPlayback?: boolean;
  playbackIndex?: number;
  onSeek?: (index: number) => void;
  onHistoricalFrameSelect?: (record: TelemetryData | null) => void;
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
  playbackIndex?: number;
  timelineIndex?: number;
  onSeek?: (index: number) => void;
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
  playbackIndex,
  timelineIndex,
  onSeek,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

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

  const getIndexFromClientX = (clientX: number, target: SVGSVGElement): number => {
    const rect = target.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
    const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
    const idx = Math.round(ratio * (dataPoints.length - 1));
    return Math.max(0, Math.min(dataPoints.length - 1, idx));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const idx = getIndexFromClientX(e.clientX, e.currentTarget);
    setHoverIndex(idx);
    if (onSeek) onSeek(idx);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging || (e.buttons & 1) === 1) {
      const idx = getIndexFromClientX(e.clientX, e.currentTarget);
      setHoverIndex(idx);
      if (onSeek) onSeek(idx);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      if (svgX < padding.left - 10 || svgX > width - padding.right + 10) {
        setHoverIndex(null);
        return;
      }
      const idx = getIndexFromClientX(e.clientX, e.currentTarget);
      setHoverIndex(idx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setHoverIndex(null);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverIndex(null);
    }
  };

  const activeTimelineIndex = playbackIndex !== undefined ? playbackIndex : timelineIndex;
  const activeIndex =
    hoverIndex !== null
      ? hoverIndex
      : activeTimelineIndex !== undefined &&
        activeTimelineIndex >= 0 &&
        activeTimelineIndex < dataPoints.length
      ? activeTimelineIndex
      : null;
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
          {isDragging ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-semibold animate-pulse shadow-2xs">
              拖动定位: {hoveredTime}
            </span>
          ) : hoverIndex !== null ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
              悬停: {hoveredTime}
            </span>
          ) : activeTimelineIndex !== undefined && hoveredPoint ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
              定位: {hoveredTime}
            </span>
          ) : null}
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
        className={`w-full h-auto block select-none touch-none ${
          isDragging
            ? 'cursor-grabbing'
            : onSeek
            ? 'cursor-ew-resize'
            : 'cursor-crosshair'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
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

        {/* X-axis time ticks */}
        {dataPoints.length > 1 &&
          [0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const dataIdx = Math.min(
              dataPoints.length - 1,
              Math.floor(pct * (dataPoints.length - 1))
            );
            const x = getX(dataIdx);
            const timeStr = formatTime(dataPoints[dataIdx].timestamp, dataIdx);
            const textAnchor = idx === 0 ? 'start' : idx === 4 ? 'end' : 'middle';
            return (
              <g key={`x-tick-${pct}`} pointerEvents="none">
                <line
                  x1={x}
                  y1={padding.top + chartHeight}
                  x2={x}
                  y2={padding.top + chartHeight + 4}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padding.top + chartHeight + 15}
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="ui-monospace, Consolas, monospace"
                  textAnchor={textAnchor}
                >
                  {timeStr}
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

        {/* Latest point circle (when not hovering and no timeline/playback index) */}
        {dataPoints.length > 0 && hoverIndex === null && activeTimelineIndex === undefined && (
          <circle
            cx={getX(dataPoints.length - 1)}
            cy={getY(latestVal)}
            r="4"
            fill={color}
            stroke="#ffffff"
            strokeWidth="2"
          />
        )}

        {/* Timeline / Playback playhead line & point */}
        {activeTimelineIndex !== undefined &&
          activeTimelineIndex >= 0 &&
          activeTimelineIndex < dataPoints.length &&
          (hoverIndex === null || hoverIndex !== activeTimelineIndex) && (
            <g pointerEvents="none">
              <line
                x1={getX(activeTimelineIndex)}
                y1={padding.top}
                x2={getX(activeTimelineIndex)}
                y2={padding.top + chartHeight}
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4 2"
              />
              <circle
                cx={getX(activeTimelineIndex)}
                cy={getY(dataPoints[activeTimelineIndex][dataKey] ?? dataPoints[activeTimelineIndex].temperature ?? 0)}
                r="5"
                fill={color}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

        {/* Full area transparent rect to guarantee pointer events on every pixel */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
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
  playbackIndex?: number;
  timelineIndex?: number;
  onSeek?: (index: number) => void;
}

const DualTempChartItem: React.FC<DualTempChartProps> = ({
  dataPoints,
  width,
  height,
  padding,
  playbackIndex,
  timelineIndex,
  onSeek,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

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

  const getIndexFromClientX = (clientX: number, target: SVGSVGElement): number => {
    const rect = target.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
    const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
    const idx = Math.round(ratio * (dataPoints.length - 1));
    return Math.max(0, Math.min(dataPoints.length - 1, idx));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const idx = getIndexFromClientX(e.clientX, e.currentTarget);
    setHoverIndex(idx);
    if (onSeek) onSeek(idx);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging || (e.buttons & 1) === 1) {
      const idx = getIndexFromClientX(e.clientX, e.currentTarget);
      setHoverIndex(idx);
      if (onSeek) onSeek(idx);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      if (svgX < padding.left - 10 || svgX > width - padding.right + 10) {
        setHoverIndex(null);
        return;
      }
      const idx = getIndexFromClientX(e.clientX, e.currentTarget);
      setHoverIndex(idx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setHoverIndex(null);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverIndex(null);
    }
  };

  const activeTimelineIndex = playbackIndex !== undefined ? playbackIndex : timelineIndex;
  const activeIndex =
    hoverIndex !== null
      ? hoverIndex
      : activeTimelineIndex !== undefined &&
        activeTimelineIndex >= 0 &&
        activeTimelineIndex < dataPoints.length
      ? activeTimelineIndex
      : null;
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
          {isDragging ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-semibold animate-pulse shadow-2xs">
              拖动定位: {hoveredTime}
            </span>
          ) : hoverIndex !== null ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
              悬停: {hoveredTime}
            </span>
          ) : activeTimelineIndex !== undefined && hoveredPoint ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
              定位: {hoveredTime}
            </span>
          ) : null}
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
        className={`w-full h-auto block select-none touch-none ${
          isDragging
            ? 'cursor-grabbing'
            : onSeek
            ? 'cursor-ew-resize'
            : 'cursor-crosshair'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
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

        {/* X-axis time ticks */}
        {dataPoints.length > 1 &&
          [0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const dataIdx = Math.min(
              dataPoints.length - 1,
              Math.floor(pct * (dataPoints.length - 1))
            );
            const x = getX(dataIdx);
            const timeStr = formatTime(dataPoints[dataIdx].timestamp, dataIdx);
            const textAnchor = idx === 0 ? 'start' : idx === 4 ? 'end' : 'middle';
            return (
              <g key={`x-tick-dual-${pct}`} pointerEvents="none">
                <line
                  x1={x}
                  y1={padding.top + chartHeight}
                  x2={x}
                  y2={padding.top + chartHeight + 4}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padding.top + chartHeight + 15}
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="ui-monospace, Consolas, monospace"
                  textAnchor={textAnchor}
                >
                  {timeStr}
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

        {/* End points when not hovering and no timeline/playback index */}
        {hoverIndex === null && activeTimelineIndex === undefined && (
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

        {/* Timeline / Playback playhead line and dual markers */}
        {activeTimelineIndex !== undefined &&
          activeTimelineIndex >= 0 &&
          activeTimelineIndex < dataPoints.length &&
          (hoverIndex === null || hoverIndex !== activeTimelineIndex) && (
            <g pointerEvents="none">
              <line
                x1={getX(activeTimelineIndex)}
                y1={padding.top}
                x2={getX(activeTimelineIndex)}
                y2={padding.top + chartHeight}
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
              <circle
                cx={getX(activeTimelineIndex)}
                cy={getY(dataPoints[activeTimelineIndex].temp_tank1 ?? dataPoints[activeTimelineIndex].temperature ?? 0)}
                r="5"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={getX(activeTimelineIndex)}
                cy={getY(dataPoints[activeTimelineIndex].temp_tank2 ?? dataPoints[activeTimelineIndex].temperature ?? 0)}
                r="5"
                fill="#ea580c"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

        {/* Full area transparent rect to guarantee pointer events on every pixel */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
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

export const RealtimeCharts: React.FC<RealtimeChartsProps> = ({
  history,
  isPlayback = false,
  playbackIndex,
  onSeek,
  onHistoricalFrameSelect,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 't1' | 't2' | 'pressure' | 'flow'>('all');
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [historicalData, setHistoricalData] = useState<TelemetryData[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyLimit, setHistoryLimit] = useState<number>(300);
  const [timelineIndex, setTimelineIndex] = useState<number>(0);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const [showCustomFilter, setShowCustomFilter] = useState<boolean>(false);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const fetchHistoricalRecords = async (limit: number, start?: string, end?: string) => {
    setIsLoadingHistory(true);
    try {
      let url = '';
      if (start || end) {
        url = `/api/history/query?order=ASC&limit=${limit}`;
        if (start) url += `&start_time=${encodeURIComponent(start)}`;
        if (end) url += `&end_time=${encodeURIComponent(end)}`;
      } else {
        url = `/api/history/query?order=DESC&limit=${limit}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        let records: TelemetryData[] = json.records || [];
        if (!start && !end) {
          records = [...records].reverse();
        }
        setHistoricalData(records);
        if (records.length > 0) {
          const lastIdx = records.length - 1;
          setTimelineIndex(lastIdx);
          onHistoricalFrameSelect?.(records[lastIdx]);
        }
      }
    } catch (e) {
      console.error('Failed to query historical data from SQLite:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSwitchToHistory = () => {
    setViewMode('history');
    if (historicalData.length === 0) {
      fetchHistoricalRecords(historyLimit);
    } else {
      const idx = Math.min(timelineIndex, historicalData.length - 1);
      onHistoricalFrameSelect?.(historicalData[idx]);
    }
  };

  const handleSwitchToLive = () => {
    setViewMode('live');
    setIsPlayingTimeline(false);
    onHistoricalFrameSelect?.(null);
  };

  const handleSeek = (index: number) => {
    setTimelineIndex(index);
    setIsPlayingTimeline(false);
    const target =
      viewMode === 'history' ? historicalData[index] : isPlayback ? history[index] : null;
    if (target) {
      onHistoricalFrameSelect?.(target);
    }
    if (onSeek) onSeek(index);
  };

  const dataPoints = isPlayback
    ? history
    : viewMode === 'history'
    ? historicalData
    : history.slice(-40);

  // Auto-play ticker along the historical timeline
  useEffect(() => {
    if (!isPlayingTimeline || dataPoints.length === 0) return;
    const intervalMs = Math.max(50, Math.floor(1000 / playSpeed));
    const timer = setInterval(() => {
      setTimelineIndex((prev) => {
        if (prev >= dataPoints.length - 1) {
          setIsPlayingTimeline(false);
          return prev;
        }
        const next = prev + 1;
        if (viewMode === 'history' && historicalData[next]) {
          onHistoricalFrameSelect?.(historicalData[next]);
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [
    isPlayingTimeline,
    playSpeed,
    dataPoints.length,
    viewMode,
    historicalData,
    onHistoricalFrameSelect,
  ]);

  const stats = useMemo(() => {
    const dataset = isPlayback ? history : viewMode === 'history' ? historicalData : null;
    if (!dataset || dataset.length === 0) return null;

    let minT1 = Infinity,
      maxT1 = -Infinity,
      sumT1 = 0;
    let minT2 = Infinity,
      maxT2 = -Infinity,
      sumT2 = 0;
    let minP = Infinity,
      maxP = -Infinity,
      sumP = 0;
    let minF = Infinity,
      maxF = -Infinity,
      sumF = 0;

    for (const d of dataset) {
      const t1 = d.temp_tank1 ?? d.temperature ?? 0;
      const t2 = d.temp_tank2 ?? d.temperature ?? 0;
      const p = d.pressure ?? 0;
      const f = d.flow_rate ?? 0;

      if (t1 < minT1) minT1 = t1;
      if (t1 > maxT1) maxT1 = t1;
      sumT1 += t1;

      if (t2 < minT2) minT2 = t2;
      if (t2 > maxT2) maxT2 = t2;
      sumT2 += t2;

      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
      sumP += p;

      if (f < minF) minF = f;
      if (f > maxF) maxF = f;
      sumF += f;
    }

    const count = dataset.length;
    return {
      count,
      startTime: dataset[0].timestamp,
      endTime: dataset[count - 1].timestamp,
      t1: { min: minT1, max: maxT1, avg: sumT1 / count },
      t2: { min: minT2, max: maxT2, avg: sumT2 / count },
      pressure: { min: minP, max: maxP, avg: sumP / count },
      flow: { min: minF, max: maxF, avg: sumF / count },
    };
  }, [historicalData, history, isPlayback, viewMode]);

  const currentFrame =
    dataPoints.length > 0 && timelineIndex >= 0 && timelineIndex < dataPoints.length
      ? dataPoints[timelineIndex]
      : null;
  const currentTimeStr = currentFrame
    ? formatTime(currentFrame.timestamp, timelineIndex)
    : '--:--:--';
  const progressPct =
    dataPoints.length > 1
      ? ((timelineIndex / (dataPoints.length - 1)) * 100).toFixed(0)
      : '100';

  const width = 800;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
      {/* Top Header: Title, Mode Toggles, and Channel Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
              isPlayback
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : viewMode === 'history'
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}
          >
            {isPlayback ? (
              <Clock className="w-5 h-5" />
            ) : viewMode === 'history' ? (
              <Database className="w-5 h-5" />
            ) : (
              <TrendingUp className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-gray-900">
                {isPlayback
                  ? '历史趋势时序回放波形'
                  : viewMode === 'history'
                  ? '历史记录趋势分析 (SQLite)'
                  : '实时运行趋势监控'}
              </h3>
              {isPlayback && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  时序推演 · 点击折线跳转
                </span>
              )}
              {!isPlayback && viewMode === 'history' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  SQLite 持久化数据
                </span>
              )}
              {!isPlayback && viewMode === 'live' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ● 实时刷新
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-normal">
              {isPlayback
                ? '历史切片数据流推演 · 支持拖拽时间轴与折线定点跳转'
                : viewMode === 'history'
                ? '基于 SQLite 数据库历史数据直接绘制趋势曲线，支持时间轴拖动与播放推演'
                : '双水槽水温、管道压力与循环流量动态时序波形 (最近40帧)'}
            </p>
          </div>
        </div>

        {/* Action switchers: Mode Toggle & Channel Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle (Live vs History) */}
          {!isPlayback && (
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                  viewMode === 'live'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={handleSwitchToLive}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                实时动态
              </button>
              <button
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                  viewMode === 'history'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={handleSwitchToHistory}
              >
                <Database className="w-3.5 h-3.5" />
                历史记录趋势
              </button>
            </div>
          )}

          {/* Channel Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 flex-wrap">
            <button
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                activeTab === 'all'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('all')}
            >
              综合视图
            </button>
            <button
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                activeTab === 't1'
                  ? 'bg-white text-amber-600 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('t1')}
            >
              水槽1水温
            </button>
            <button
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                activeTab === 't2'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('t2')}
            >
              水槽2水温
            </button>
            <button
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                activeTab === 'pressure'
                  ? 'bg-white text-sky-600 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('pressure')}
            >
              管道压力
            </button>
            <button
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                activeTab === 'flow'
                  ? 'bg-white text-emerald-600 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('flow')}
            >
              循环流量
            </button>
          </div>
        </div>
      </div>

      {/* Interactive History Timeline Toolbar (In history mode and not in playback) */}
      {!isPlayback && viewMode === 'history' && (
        <div className="mb-3.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-xs transition-all space-y-2.5">
          {/* Row 1: Time position, cursor drag hint, sensor readings & step controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Left: Time display & Frame position & Drag hint */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                时序游标定位:
              </span>
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                {currentTimeStr}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                [ 第 {dataPoints.length > 0 ? timelineIndex + 1 : 0} / {dataPoints.length} 帧 · {progressPct}% ]
              </span>

              {/* Intuitive drag prompt */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/90 border border-indigo-200 text-indigo-700 text-[11px] font-medium">
                <MoveHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                按住下方图表直接左右拖动定位
              </span>

              {/* Instant sensor readings at timeline position */}
              {currentFrame && (
                <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-mono ml-1">
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    T1: {(currentFrame.temp_tank1 ?? currentFrame.temperature ?? 0).toFixed(1)}°C
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200">
                    T2: {(currentFrame.temp_tank2 ?? currentFrame.temperature ?? 0).toFixed(1)}°C
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                    P: {(currentFrame.pressure ?? 0).toFixed(2)}MPa
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Q: {(currentFrame.flow_rate ?? 0).toFixed(1)}L/m
                  </span>
                </div>
              )}
            </div>

            {/* Right: Step buttons and Play/Pause */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSeek(0)}
                title="跳转至最早记录"
                disabled={dataPoints.length === 0}
                className="p-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-40 transition-colors"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSeek(Math.max(0, timelineIndex - 1))}
                title="单步后退1帧"
                disabled={dataPoints.length === 0}
                className="p-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsPlayingTimeline((prev) => !prev)}
                disabled={dataPoints.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors"
              >
                {isPlayingTimeline ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{isPlayingTimeline ? '暂停' : '播放'}</span>
              </button>
              <button
                onClick={() => handleSeek(Math.min(dataPoints.length - 1, timelineIndex + 1))}
                title="单步前进1帧"
                disabled={dataPoints.length === 0}
                className="p-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSeek(Math.max(0, dataPoints.length - 1))}
                title="跳转至最新记录"
                disabled={dataPoints.length === 0}
                className="p-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 disabled:opacity-40 transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              {/* Speed selector */}
              <div className="flex items-center bg-white rounded border border-slate-200 p-0.5 text-[11px] ml-1">
                {[1, 2, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaySpeed(s)}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                      playSpeed === s
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: History span selector, custom time, refresh, export */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-200/80 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-600 font-medium">采样跨度:</span>
              {[50, 150, 300, 500, 1000].map((num) => (
                <button
                  key={num}
                  onClick={() => {
                    setHistoryLimit(num);
                    fetchHistoricalRecords(num);
                  }}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    historyLimit === num && !showCustomFilter
                      ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {num}条
                </button>
              ))}
              <button
                onClick={() => setShowCustomFilter((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                  showCustomFilter
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-3 h-3" />
                自定义时间段
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  fetchHistoricalRecords(
                    historyLimit,
                    customStart || undefined,
                    customEnd || undefined
                  )
                }
                disabled={isLoadingHistory}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isLoadingHistory ? 'animate-spin text-indigo-600' : ''
                  }`}
                />
                刷新数据
              </button>
              <button
                onClick={() => {
                  let exportUrl = '/api/history/export';
                  const params = new URLSearchParams();
                  if (customStart) params.append('start_time', customStart);
                  if (customEnd) params.append('end_time', customEnd);
                  if (params.toString()) exportUrl += `?${params.toString()}`;
                  window.open(exportUrl, '_blank');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                导出CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Time Range Filter Accordion */}
      {!isPlayback && viewMode === 'history' && showCustomFilter && (
        <div className="mb-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-slate-600 font-medium">起止时间:</label>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-indigo-500"
              />
              <span className="text-slate-400">至</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-slate-600 font-medium">数量上限:</label>
              <select
                value={historyLimit}
                onChange={(e) => setHistoryLimit(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-indigo-500"
              >
                <option value={50}>50条</option>
                <option value={150}>150条</option>
                <option value={300}>300条</option>
                <option value={500}>500条</option>
                <option value={1000}>1000条</option>
              </select>
            </div>

            <button
              onClick={() =>
                fetchHistoricalRecords(
                  historyLimit,
                  customStart || undefined,
                  customEnd || undefined
                )
              }
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-xs transition-colors shadow-xs"
            >
              查询历史趋势
            </button>
            <button
              onClick={() => {
                setCustomStart('');
                setCustomEnd('');
                fetchHistoricalRecords(historyLimit);
              }}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded font-medium text-xs transition-colors"
            >
              重置
            </button>
          </div>
        </div>
      )}

      {/* Historical Statistics Ribbon */}
      {(viewMode === 'history' || isPlayback) && stats && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                历史时序跨度 ({stats.count} 帧):
              </span>
              <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                {formatTime(stats.startTime)} ~ {formatTime(stats.endTime)}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              数据源: SQLite 嵌入式数据库
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* 水槽1 */}
            <div className="bg-white p-2 rounded-lg border border-amber-200/80">
              <div className="flex items-center justify-between text-[11px] text-amber-800 font-medium mb-1">
                <span>水槽1水温</span>
                <span className="font-mono font-semibold">
                  均 {stats.t1.avg.toFixed(1)}°C
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                <span>低: {stats.t1.min.toFixed(1)}°C</span>
                <span>高: {stats.t1.max.toFixed(1)}°C</span>
              </div>
            </div>

            {/* 水槽2 */}
            <div className="bg-white p-2 rounded-lg border border-orange-200/80">
              <div className="flex items-center justify-between text-[11px] text-orange-800 font-medium mb-1">
                <span>水槽2水温</span>
                <span className="font-mono font-semibold">
                  均 {stats.t2.avg.toFixed(1)}°C
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                <span>低: {stats.t2.min.toFixed(1)}°C</span>
                <span>高: {stats.t2.max.toFixed(1)}°C</span>
              </div>
            </div>

            {/* 管道压力 */}
            <div className="bg-white p-2 rounded-lg border border-sky-200/80">
              <div className="flex items-center justify-between text-[11px] text-sky-800 font-medium mb-1">
                <span>管道压力</span>
                <span className="font-mono font-semibold">
                  均 {stats.pressure.avg.toFixed(2)} MPa
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                <span>低: {stats.pressure.min.toFixed(2)}</span>
                <span>高: {stats.pressure.max.toFixed(2)}</span>
              </div>
            </div>

            {/* 循环流量 */}
            <div className="bg-white p-2 rounded-lg border border-emerald-200/80">
              <div className="flex items-center justify-between text-[11px] text-emerald-800 font-medium mb-1">
                <span>循环流量</span>
                <span className="font-mono font-semibold">
                  均 {stats.flow.avg.toFixed(1)} L/min
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                <span>低: {stats.flow.min.toFixed(1)}</span>
                <span>高: {stats.flow.max.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Canvas Area */}
      {isLoadingHistory && dataPoints.length === 0 ? (
        <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-sm font-medium">正在从 SQLite 载入历史传感器时序曲线...</p>
        </div>
      ) : dataPoints.length === 0 ? (
        <div className="py-16 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <Database className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium">暂无匹配的历史时序记录</p>
          <p className="text-xs text-slate-400 mt-1">
            请尝试调整起止时间或选择【300条】预设
          </p>
          <button
            onClick={() => {
              setCustomStart('');
              setCustomEnd('');
              fetchHistoricalRecords(300);
            }}
            className="mt-3 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium"
          >
            载入最近300条历史记录
          </button>
        </div>
      ) : (
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
              playbackIndex={playbackIndex}
              timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
              onSeek={handleSeek}
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
              playbackIndex={playbackIndex}
              timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
              onSeek={handleSeek}
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
              playbackIndex={playbackIndex}
              timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
              onSeek={handleSeek}
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
              playbackIndex={playbackIndex}
              timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
              onSeek={handleSeek}
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
              playbackIndex={playbackIndex}
              timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
              onSeek={handleSeek}
            />
          )}
        </div>
      )}
    </div>
  );
};
