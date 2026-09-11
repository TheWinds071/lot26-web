import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  Database,
  Download,
  RefreshCw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { TelemetryData } from '../types';

interface RealtimeChartsProps {
  history: TelemetryData[];
  isPlayback?: boolean;
  playbackIndex?: number;
  onSeek?: (index: number) => void;
  onHistoricalFrameSelect?: (record: TelemetryData | null) => void;
  onClearHistory?: () => void;
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
  visibleStart?: number;
  visibleEnd?: number;
  onPan?: (newStart: number, newEnd: number) => void;
  onWheelZoom?: (deltaY: number, mouseRatio: number) => void;
  onResetZoom?: () => void;
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
  visibleStart,
  visibleEnd,
  onPan,
  onWheelZoom,
  onResetZoom,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; start: number; end: number; hasMoved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const totalPoints = dataPoints.length;

  const curStart = visibleStart !== undefined ? Math.max(0, Math.min(totalPoints - 1, visibleStart)) : 0;
  const curEnd = visibleEnd !== undefined ? Math.max(curStart, Math.min(totalPoints - 1, visibleEnd)) : Math.max(0, totalPoints - 1);
  const curSpan = Math.max(0.001, curEnd - curStart);

  // Wheel listener with passive: false to reliably zoom without scrolling page
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onWheelZoom) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      const chartWidth = width - padding.left - padding.right;
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
      const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
      onWheelZoom(e.deltaY, ratio);
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [onWheelZoom, width, padding]);

  if (totalPoints === 0) {
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
    padding.left + ((index - curStart) / curSpan) * chartWidth;
  const getY = (val: number) =>
    padding.top + chartHeight - ((val - actualMin) / range) * chartHeight;

  // Sliced data points within view window (+1 margin for clean curve connection)
  const sliceStart = Math.max(0, Math.floor(curStart) - 1);
  const sliceEnd = Math.min(totalPoints - 1, Math.ceil(curEnd) + 1);
  const sliceData = dataPoints.slice(sliceStart, sliceEnd + 1);

  const points = sliceData
    .map((d, i) => `${getX(sliceStart + i)},${getY(d[dataKey] ?? d.temperature ?? 0)}`)
    .join(' ');

  const areaPath = `
    M ${getX(sliceStart)} ${getY(sliceData[0][dataKey] ?? sliceData[0].temperature ?? 0)}
    L ${points}
    L ${getX(sliceEnd)} ${padding.top + chartHeight}
    L ${getX(sliceStart)} ${padding.top + chartHeight}
    Z
  `;

  const latestVal =
    dataPoints[totalPoints - 1][dataKey] ??
    dataPoints[totalPoints - 1].temperature ??
    0;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = {
      clientX: e.clientX,
      start: curStart,
      end: curEnd,
      hasMoved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging && dragStartRef.current) {
      const deltaX = e.clientX - dragStartRef.current.clientX;
      if (Math.abs(deltaX) > 2) {
        dragStartRef.current.hasMoved = true;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const svgDeltaX = (deltaX / rect.width) * width;
      let start = dragStartRef.current.start;
      let end = dragStartRef.current.end;
      let span = end - start;

      // If at full view, auto-zoom to a comfortable sliding window so drag always slides ("无极滑动")
      if (span >= totalPoints - 1 - 0.01 && totalPoints > 10 && onPan) {
        const mouseX = dragStartRef.current.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
        const anchor = ratio * (totalPoints - 1);
        const initialSpan = Math.min(150, Math.max(10, Math.round(totalPoints * 0.35)));
        start = Math.max(0, Math.min(totalPoints - 1 - initialSpan, anchor - ratio * initialSpan));
        end = start + initialSpan;
        span = initialSpan;
        dragStartRef.current.start = start;
        dragStartRef.current.end = end;
      }

      if (onPan) {
        // Continuous floating-point pan without integer quantization for true "无极滑动"
        const deltaPoints = (svgDeltaX / Math.max(1, chartWidth)) * span;
        let newStart = start - deltaPoints;
        let newEnd = end - deltaPoints;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(totalPoints - 1, newStart + span);
        }
        if (newEnd > totalPoints - 1) {
          newEnd = totalPoints - 1;
          newStart = Math.max(0, newEnd - span);
        }

        onPan(newStart, newEnd);

        // Update seek position under cursor live
        const mouseX = e.clientX - rect.left;
        const svgX = (mouseX / rect.width) * width;
        const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
        const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
        const curIdx = Math.round(newStart + ratio * (newEnd - newStart));
        const clampedIdx = Math.max(0, Math.min(totalPoints - 1, curIdx));
        if (onSeek) onSeek(clampedIdx);
        setHoverIndex(clampedIdx);
      }
    } else {
      // Normal hover
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      if (svgX < padding.left - 10 || svgX > width - padding.right + 10) {
        setHoverIndex(null);
        return;
      }
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
      const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
      const curIdx = Math.round(curStart + ratio * curSpan);
      const clampedIdx = Math.max(0, Math.min(totalPoints - 1, curIdx));
      setHoverIndex(clampedIdx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (dragStartRef.current && !dragStartRef.current.hasMoved && totalPoints > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
      const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
      const curIdx = Math.round(curStart + ratio * curSpan);
      const clampedIdx = Math.max(0, Math.min(totalPoints - 1, curIdx));
      if (onSeek) onSeek(clampedIdx);
      setHoverIndex(clampedIdx);
    }
    dragStartRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = null;
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
        activeTimelineIndex >= curStart &&
        activeTimelineIndex <= curEnd
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
              无极平移: {hoveredTime}
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
            {displayVal.toFixed(dataKey === 'pressure' ? (actualMax >= 10 ? 0 : 2) : (dataKey === 'flow_rate' ? 2 : 1))}
          </span>
          <span className="text-xs text-gray-500 font-normal">{unit}</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full h-auto block select-none touch-none ${
          isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={onResetZoom}
      >
        <defs>
          <clipPath id={`chart-clip-${dataKey}`}>
            <rect
              x={padding.left}
              y={padding.top}
              width={chartWidth}
              height={chartHeight}
            />
          </clipPath>
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
                {val.toFixed(dataKey === 'pressure' ? (actualMax >= 10 ? 0 : 1) : (dataKey === 'flow_rate' && actualMax <= 1.0 ? 2 : 0))}
              </text>
            </g>
          );
        })}

        {/* X-axis time ticks sampled across visible view window */}
        {totalPoints > 1 &&
          [0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const dataIdx = Math.min(
              totalPoints - 1,
              Math.max(0, Math.round(curStart + pct * curSpan))
            );
            const x = padding.left + pct * chartWidth;
            const timeStr = formatTime(dataPoints[dataIdx]?.timestamp, dataIdx);
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

        {/* Area fill with clipPath */}
        <path
          d={areaPath}
          fill={`url(#corp-grad-${dataKey})`}
          clipPath={`url(#chart-clip-${dataKey})`}
        />

        {/* Line stroke with clipPath */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          clipPath={`url(#chart-clip-${dataKey})`}
        />

        {/* Latest point circle (when at end of data) */}
        {totalPoints > 0 &&
          hoverIndex === null &&
          activeTimelineIndex === undefined &&
          curEnd >= totalPoints - 1 && (
            <circle
              cx={getX(totalPoints - 1)}
              cy={getY(latestVal)}
              r="4"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
              clipPath={`url(#chart-clip-${dataKey})`}
            />
          )}

        {/* Timeline / Playback playhead line & point */}
        {activeTimelineIndex !== undefined &&
          activeTimelineIndex >= curStart &&
          activeTimelineIndex <= curEnd &&
          (hoverIndex === null || hoverIndex !== activeTimelineIndex) && (
            <g pointerEvents="none" clipPath={`url(#chart-clip-${dataKey})`}>
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
                {hoveredVal.toFixed(dataKey === 'pressure' ? (actualMax >= 10 ? 0 : 2) : (dataKey === 'flow_rate' ? 2 : 1))} {unit}
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
  visibleStart?: number;
  visibleEnd?: number;
  onPan?: (newStart: number, newEnd: number) => void;
  onWheelZoom?: (deltaY: number, mouseRatio: number) => void;
  onResetZoom?: () => void;
}

const DualTempChartItem: React.FC<DualTempChartProps> = ({
  dataPoints,
  width,
  height,
  padding,
  playbackIndex,
  timelineIndex,
  onSeek,
  visibleStart,
  visibleEnd,
  onPan,
  onWheelZoom,
  onResetZoom,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; start: number; end: number; hasMoved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const totalPoints = dataPoints.length;

  const curStart = visibleStart !== undefined ? Math.max(0, Math.min(totalPoints - 1, visibleStart)) : 0;
  const curEnd = visibleEnd !== undefined ? Math.max(curStart, Math.min(totalPoints - 1, visibleEnd)) : Math.max(0, totalPoints - 1);
  const curSpan = Math.max(0.001, curEnd - curStart);

  // Wheel listener with passive: false to reliably zoom without scrolling page
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onWheelZoom) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      const chartWidth = width - padding.left - padding.right;
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
      const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
      onWheelZoom(e.deltaY, ratio);
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [onWheelZoom, width, padding]);

  if (totalPoints === 0) return null;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const t1Vals = dataPoints.map((d) => d.temp_tank1 ?? d.temperature ?? 0);
  const t2Vals = dataPoints.map((d) => d.temp_tank2 ?? d.temperature ?? 0);
  const allVals = [...t1Vals, ...t2Vals];
  const actualMin = Math.min(...allVals, 20);
  const actualMax = Math.max(...allVals, 80);
  const range = actualMax - actualMin || 1;

  const getX = (index: number) =>
    padding.left + ((index - curStart) / curSpan) * chartWidth;
  const getY = (val: number) =>
    padding.top + chartHeight - ((val - actualMin) / range) * chartHeight;

  // Sliced data points within view window
  const sliceStart = Math.max(0, Math.floor(curStart) - 1);
  const sliceEnd = Math.min(totalPoints - 1, Math.ceil(curEnd) + 1);
  const sliceData = dataPoints.slice(sliceStart, sliceEnd + 1);

  const points1 = sliceData
    .map((d, i) => `${getX(sliceStart + i)},${getY(d.temp_tank1 ?? d.temperature ?? 0)}`)
    .join(' ');
  const points2 = sliceData
    .map((d, i) => `${getX(sliceStart + i)},${getY(d.temp_tank2 ?? d.temperature ?? 0)}`)
    .join(' ');

  const latest1 = t1Vals[totalPoints - 1];
  const latest2 = t2Vals[totalPoints - 1];

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = {
      clientX: e.clientX,
      start: curStart,
      end: curEnd,
      hasMoved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging && dragStartRef.current) {
      const deltaX = e.clientX - dragStartRef.current.clientX;
      if (Math.abs(deltaX) > 2) {
        dragStartRef.current.hasMoved = true;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const svgDeltaX = (deltaX / rect.width) * width;
      let start = dragStartRef.current.start;
      let end = dragStartRef.current.end;
      let span = end - start;

      // If at full view, auto-focus into sliding window so drag always slides ("无极滑动")
      if (span >= totalPoints - 1 - 0.01 && totalPoints > 10 && onPan) {
        const mouseX = dragStartRef.current.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
        const anchor = ratio * (totalPoints - 1);
        const initialSpan = Math.min(150, Math.max(10, Math.round(totalPoints * 0.35)));
        start = Math.max(0, Math.min(totalPoints - 1 - initialSpan, anchor - ratio * initialSpan));
        end = start + initialSpan;
        span = initialSpan;
        dragStartRef.current.start = start;
        dragStartRef.current.end = end;
      }

      if (onPan) {
        // Continuous floating-point pan without integer quantization for true "无极滑动"
        const deltaPoints = (svgDeltaX / Math.max(1, chartWidth)) * span;
        let newStart = start - deltaPoints;
        let newEnd = end - deltaPoints;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(totalPoints - 1, newStart + span);
        }
        if (newEnd > totalPoints - 1) {
          newEnd = totalPoints - 1;
          newStart = Math.max(0, newEnd - span);
        }

        onPan(newStart, newEnd);

        // Update seek position under cursor live
        const mouseX = e.clientX - rect.left;
        const svgX = (mouseX / rect.width) * width;
        const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
        const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
        const curIdx = Math.round(newStart + ratio * (newEnd - newStart));
        const clampedIdx = Math.max(0, Math.min(totalPoints - 1, curIdx));
        if (onSeek) onSeek(clampedIdx);
        setHoverIndex(clampedIdx);
      }
    } else {
      // Normal hover
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      if (svgX < padding.left - 10 || svgX > width - padding.right + 10) {
        setHoverIndex(null);
        return;
      }
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
      const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
      const curIdx = Math.round(curStart + ratio * curSpan);
      const clampedIdx = Math.max(0, Math.min(totalPoints - 1, curIdx));
      setHoverIndex(clampedIdx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (dragStartRef.current && !dragStartRef.current.hasMoved && totalPoints > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * width;
      const chartWidth = width - padding.left - padding.right;
      const clampedX = Math.max(padding.left, Math.min(width - padding.right, svgX));
      const ratio = (clampedX - padding.left) / Math.max(1, chartWidth);
      const curIdx = Math.round(curStart + ratio * curSpan);
      const clampedIdx = Math.max(0, Math.min(totalPoints - 1, curIdx));
      if (onSeek) onSeek(clampedIdx);
      setHoverIndex(clampedIdx);
    }
    dragStartRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = null;
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
        activeTimelineIndex >= curStart &&
        activeTimelineIndex <= curEnd
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
              无极平移: {hoveredTime}
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
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full h-auto block select-none touch-none ${
          isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={onResetZoom}
      >
        <defs>
          <clipPath id="chart-clip-dual">
            <rect
              x={padding.left}
              y={padding.top}
              width={chartWidth}
              height={chartHeight}
            />
          </clipPath>
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

        {/* X-axis time ticks sampled across visible view window */}
        {totalPoints > 1 &&
          [0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const dataIdx = Math.min(
              totalPoints - 1,
              Math.max(0, Math.round(curStart + pct * curSpan))
            );
            const x = padding.left + pct * chartWidth;
            const timeStr = formatTime(dataPoints[dataIdx]?.timestamp, dataIdx);
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

        {/* Line 1: Tank 1 with clipPath */}
        <polyline
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.5"
          strokeLinecap="round"
          points={points1}
          clipPath="url(#chart-clip-dual)"
        />
        {/* Line 2: Tank 2 with clipPath */}
        <polyline
          fill="none"
          stroke="#ea580c"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="6 3"
          points={points2}
          clipPath="url(#chart-clip-dual)"
        />

        {/* End points when at end of data */}
        {totalPoints > 0 &&
          hoverIndex === null &&
          activeTimelineIndex === undefined &&
          curEnd >= totalPoints - 1 && (
            <>
              <circle
                cx={getX(totalPoints - 1)}
                cy={getY(latest1)}
                r="4"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="2"
                clipPath="url(#chart-clip-dual)"
              />
              <circle
                cx={getX(totalPoints - 1)}
                cy={getY(latest2)}
                r="4"
                fill="#ea580c"
                stroke="#ffffff"
                strokeWidth="2"
                clipPath="url(#chart-clip-dual)"
              />
            </>
          )}

        {/* Timeline / Playback playhead line and dual markers */}
        {activeTimelineIndex !== undefined &&
          activeTimelineIndex >= curStart &&
          activeTimelineIndex <= curEnd &&
          (hoverIndex === null || hoverIndex !== activeTimelineIndex) && (
            <g pointerEvents="none" clipPath="url(#chart-clip-dual)">
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
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 't1' | 't2' | 'pressure' | 'flow'>('all');
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [historicalData, setHistoricalData] = useState<TelemetryData[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);
  const [timelineIndex, setTimelineIndex] = useState<number>(0);
  const [showCustomFilter, setShowCustomFilter] = useState<boolean>(false);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);

  const fetchHistoricalRecords = async (start?: string, end?: string) => {
    setIsLoadingHistory(true);
    try {
      let url = '/api/history/query?order=ASC';
      if (start) url += `&start_time=${encodeURIComponent(start)}`;
      if (end) url += `&end_time=${encodeURIComponent(end)}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const records: TelemetryData[] = json.records || [];
        setHistoricalData(records);
        if (records.length > 0) {
          const lastIdx = records.length - 1;
          setTimelineIndex(lastIdx);
          onHistoricalFrameSelect?.(records[lastIdx]);
          // Default to viewing a comfortable active window (150 points) so user can immediately slide backwards
          const defaultSpan = Math.min(150, lastIdx);
          if (defaultSpan > 0 && records.length > 30) {
            setViewRange({ start: lastIdx - defaultSpan, end: lastIdx });
          } else {
            setViewRange(null);
          }
        } else {
          setViewRange(null);
        }
      }
    } catch (e) {
      console.error('Failed to query historical data from SQLite:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleClearDatabaseHistory = async () => {
    const confirmed = window.confirm(
      '⚠️ 确定要清空数据库中的所有历史遥测数据吗？\n\n此操作将永久删除 SQLite 数据库中记录的所有传感器历史数据，清空后无法恢复。'
    );
    if (!confirmed) return;

    setIsClearingHistory(true);
    try {
      const res = await fetch('/api/history', { method: 'DELETE' });
      if (res.ok) {
        setHistoricalData([]);
        setViewRange(null);
        setTimelineIndex(0);
        onHistoricalFrameSelect?.(null);
        onClearHistory?.();
        await fetchHistoricalRecords();
      } else {
        alert('清空历史数据失败，请检查后端服务状态。');
      }
    } catch (err) {
      console.error('Failed to clear database history:', err);
      alert('清空历史数据请求失败。');
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleSwitchToHistory = () => {
    setViewMode('history');
    if (historicalData.length === 0) {
      fetchHistoricalRecords();
    } else {
      const idx = Math.min(timelineIndex, historicalData.length - 1);
      onHistoricalFrameSelect?.(historicalData[idx]);
    }
  };

  const handleSwitchToLive = () => {
    setViewMode('live');
    setViewRange(null);
    onHistoricalFrameSelect?.(null);
  };

  const handleSeek = (index: number) => {
    setTimelineIndex(index);
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

  const totalPoints = dataPoints.length;
  const visibleStart = viewRange
    ? Math.max(0, Math.min(totalPoints - 1, viewRange.start))
    : 0;
  const visibleEnd = viewRange
    ? Math.max(visibleStart, Math.min(totalPoints - 1, viewRange.end))
    : Math.max(0, totalPoints - 1);
  const isZoomed =
    viewRange !== null &&
    (visibleStart > 0.01 || visibleEnd < totalPoints - 1 - 0.01) &&
    visibleEnd - visibleStart < totalPoints - 1 - 0.01;

  const handleWheelZoom = (deltaY: number, mouseRatio: number) => {
    if (totalPoints <= 3) return;

    const currentSpan = visibleEnd - visibleStart;
    const zoomFactor = deltaY < 0 ? 0.75 : 1.35;
    const minSpan = Math.min(4, totalPoints - 1);
    const maxSpan = totalPoints - 1;

    let newSpan = currentSpan * zoomFactor;
    newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));

    if (newSpan >= maxSpan - 0.01) {
      setViewRange(null);
      return;
    }

    const anchorIdx = visibleStart + mouseRatio * currentSpan;
    let newStart = anchorIdx - mouseRatio * newSpan;
    let newEnd = newStart + newSpan;

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(totalPoints - 1, newStart + newSpan);
    }
    if (newEnd > totalPoints - 1) {
      newEnd = totalPoints - 1;
      newStart = Math.max(0, newEnd - newSpan);
    }

    setViewRange({ start: newStart, end: newEnd });
  };

  const handlePan = (newStart: number, newEnd: number) => {
    setViewRange({ start: newStart, end: newEnd });
  };

  const handleResetZoom = () => {
    if (isZoomed) {
      setViewRange(null);
    } else if (totalPoints > 150) {
      const defaultSpan = 150;
      const targetIdx = Math.min(timelineIndex, totalPoints - 1);
      const half = Math.floor(defaultSpan / 2);
      const start = Math.max(0, Math.min(totalPoints - 1 - defaultSpan, targetIdx - half));
      setViewRange({ start, end: start + defaultSpan });
    }
  };

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
                  ? '历史记录趋势分析'
                  : '实时运行趋势监控'}
              </h3>
              {isPlayback && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  时序推演 · 点击折线跳转
                </span>
              )}
              {!isPlayback && viewMode === 'live' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ● 实时刷新
                </span>
              )}
            </div>
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

          {/* History Mode Actions: 刷新数据 & 导出CSV & 时间筛选 */}
          {viewMode === 'history' && !isPlayback && (
            <div className="flex items-center gap-2 ml-auto sm:ml-0 flex-wrap">
              <button
                onClick={() =>
                  fetchHistoricalRecords(
                    customStart || undefined,
                    customEnd || undefined
                  )
                }
                disabled={isLoadingHistory}
                className="inline-flex items-center justify-center p-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                title="刷新历史数据"
                aria-label="刷新历史数据"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isLoadingHistory ? 'animate-spin text-indigo-600' : ''
                  }`}
                />
              </button>
              <button
                onClick={handleClearDatabaseHistory}
                disabled={isClearingHistory || isLoadingHistory}
                className="inline-flex items-center justify-center p-1.5 text-xs font-medium rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                title="清空 SQLite 数据库中的所有历史遥测记录"
                aria-label="清空历史数据"
              >
                <Trash2
                  className={`w-3.5 h-3.5 ${
                    isClearingHistory ? 'animate-spin text-rose-600' : ''
                  }`}
                />
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
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                导出CSV
              </button>
              <button
                onClick={() => setShowCustomFilter((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors shadow-2xs ${
                  showCustomFilter
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="按时间段筛选"
              >
                <Calendar className="w-3.5 h-3.5" />
                时间筛选
              </button>
            </div>
          )}
        </div>
      </div>

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

            <button
              onClick={() =>
                fetchHistoricalRecords(
                  customStart || undefined,
                  customEnd || undefined
                )
              }
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-xs transition-colors shadow-xs"
            >
              按时间段全量查询
            </button>
            <button
              onClick={() => {
                setCustomStart('');
                setCustomEnd('');
                fetchHistoricalRecords();
              }}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded font-medium text-xs transition-colors"
            >
              重置并载入全部历史
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
                  均 {stats.pressure.avg >= 10 ? Math.round(stats.pressure.avg).toLocaleString() : stats.pressure.avg.toFixed(2)} Pa
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                <span>低: {stats.pressure.min >= 10 ? Math.round(stats.pressure.min).toLocaleString() : stats.pressure.min.toFixed(2)}</span>
                <span>高: {stats.pressure.max >= 10 ? Math.round(stats.pressure.max).toLocaleString() : stats.pressure.max.toFixed(2)}</span>
              </div>
            </div>

            {/* 循环流量 */}
            <div className="bg-white p-2 rounded-lg border border-emerald-200/80">
              <div className="flex items-center justify-between text-[11px] text-emerald-800 font-medium mb-1">
                <span>循环流量</span>
                <span className="font-mono font-semibold">
                  均 {stats.flow.avg.toFixed(2)} L/min
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                <span>低: {stats.flow.min.toFixed(2)}</span>
                <span>高: {stats.flow.max.toFixed(2)}</span>
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
            请尝试调整起止时间或载入全量时序
          </p>
          <button
            onClick={() => {
              setCustomStart('');
              setCustomEnd('');
              fetchHistoricalRecords();
            }}
            className="mt-3 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium"
          >
            载入全部历史记录 (无极浏览)
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
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              onPan={handlePan}
              onWheelZoom={handleWheelZoom}
              onResetZoom={handleResetZoom}
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
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              onPan={handlePan}
              onWheelZoom={handleWheelZoom}
              onResetZoom={handleResetZoom}
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
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              onPan={handlePan}
              onWheelZoom={handleWheelZoom}
              onResetZoom={handleResetZoom}
            />
          )}

          {(activeTab === 'all' || activeTab === 'pressure') && (() => {
            const maxPressInData = dataPoints.length > 0 ? Math.max(...dataPoints.map((d) => d.pressure ?? 0), 0) : 0;
            const dynamicPressMaxVal = maxPressInData > 10 ? Math.ceil(maxPressInData * 1.25) : 800000;
            return (
              <SingleChartItem
                dataKey="pressure"
                color="#0284c7"
                unit="Pa"
                title="管道压力趋势 (Pa)"
                minVal={0.0}
                maxVal={dynamicPressMaxVal}
                dataPoints={dataPoints}
                width={width}
                height={height}
                padding={padding}
                playbackIndex={playbackIndex}
                timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
                onSeek={handleSeek}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                onPan={handlePan}
                onWheelZoom={handleWheelZoom}
                onResetZoom={handleResetZoom}
              />
            );
          })()}

          {(activeTab === 'all' || activeTab === 'flow') && (() => {
            const maxFlowInData = dataPoints.length > 0 ? Math.max(...dataPoints.map((d) => d.flow_rate ?? 0), 0) : 0;
            const dynamicFlowMaxVal = maxFlowInData <= 1.0 ? 0.45 : 35;
            return (
              <SingleChartItem
                dataKey="flow_rate"
                color="#059669"
                unit="L/min"
                title="槽间循环流量趋势 (L/min)"
                minVal={0.0}
                maxVal={dynamicFlowMaxVal}
                dataPoints={dataPoints}
                width={width}
                height={height}
                padding={padding}
                playbackIndex={playbackIndex}
                timelineIndex={viewMode === 'history' ? timelineIndex : undefined}
                onSeek={handleSeek}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                onPan={handlePan}
                onWheelZoom={handleWheelZoom}
                onResetZoom={handleResetZoom}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
};
