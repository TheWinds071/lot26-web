import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Download,
  FastForward,
  History,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import type { TelemetryData } from '../types';

interface PlaybackControllerProps {
  isPlayback: boolean;
  isPlaying: boolean;
  speed: number;
  currentIndex: number;
  totalFrames: number;
  currentRecord?: TelemetryData;
  playbackData: TelemetryData[];
  isLoading: boolean;
  onTogglePlay: () => void;
  onSeek: (index: number) => void;
  onStep: (delta: number) => void;
  onChangeSpeed: (speed: number) => void;
  onReset: () => void;
  onExitPlayback: () => void;
  onLoadPreset: (limit: number) => void;
  onLoadCustomRange: (startTime: string, endTime: string, limit: number) => void;
  onExportCsv: () => void;
}

export const PlaybackController: React.FC<PlaybackControllerProps> = ({
  isPlayback,
  isPlaying,
  speed,
  currentIndex,
  totalFrames,
  currentRecord,
  playbackData,
  isLoading,
  onTogglePlay,
  onSeek,
  onStep,
  onChangeSpeed,
  onReset,
  onExitPlayback,
  onLoadPreset,
  onLoadCustomRange,
  onExportCsv,
}) => {
  const [showCustomRange, setShowCustomRange] = useState<boolean>(false);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [customLimit, setCustomLimit] = useState<number>(200);

  if (!isPlayback) return null;

  const formatTimestamp = (ts?: string): string => {
    if (!ts) return '--:--:--';
    try {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('zh-CN', {
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }
    } catch {
      // fallback
    }
    return ts;
  };

  const startTimeStr =
    playbackData.length > 0 ? formatTimestamp(playbackData[0].timestamp) : '--';
  const endTimeStr =
    playbackData.length > 0
      ? formatTimestamp(playbackData[playbackData.length - 1].timestamp)
      : '--';
  const currentTimeStr = formatTimestamp(currentRecord?.timestamp);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    onLoadCustomRange(
      new Date(customStart).toISOString(),
      new Date(customEnd).toISOString(),
      customLimit
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-amber-400 p-4 md:p-5 transition-all duration-200">
      {/* 1. Header with Mode Badge & Top Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">
                历史时序数据回放控制台
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                回放中 (PLAYBACK)
              </span>
            </div>
            <p className="text-xs text-gray-500">
              数据源: SQLite 本地持久化数据库 · 整个看板（遥测卡片、工艺拓扑及趋势波形）已同步历史帧
            </p>
          </div>
        </div>

        {/* Action Buttons: Presets, CSV Export, Exit */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => onLoadPreset(50)}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-700 hover:bg-white hover:shadow-xs transition-all"
            >
              近50条
            </button>
            <button
              onClick={() => onLoadPreset(200)}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-700 hover:bg-white hover:shadow-xs transition-all"
            >
              近200条
            </button>
            <button
              onClick={() => onLoadPreset(500)}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-700 hover:bg-white hover:shadow-xs transition-all"
            >
              近500条
            </button>
            <button
              onClick={() => setShowCustomRange(!showCustomRange)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${
                showCustomRange
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-700 hover:bg-white hover:shadow-xs'
              }`}
            >
              <Calendar className="w-3 h-3" />
              时间段
            </button>
          </div>

          {/* Export CSV */}
          <button
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-xs"
            title="导出当前历史时序为 CSV 报表"
          >
            <Download className="w-3.5 h-3.5 text-gray-600" />
            <span>导出CSV</span>
          </button>

          {/* Exit Playback */}
          <button
            onClick={onExitPlayback}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
          >
            <X className="w-3.5 h-3.5" />
            <span>退出回放 (返回实时)</span>
          </button>
        </div>
      </div>

      {/* 2. Collapsible Custom Date-Time Filter Form */}
      {showCustomRange && (
        <form
          onSubmit={handleCustomSubmit}
          className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-3 text-xs"
        >
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700">起始时间:</span>
            <input
              type="datetime-local"
              required
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 bg-white border border-gray-300 rounded text-gray-800"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700">截止时间:</span>
            <input
              type="datetime-local"
              required
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 bg-white border border-gray-300 rounded text-gray-800"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700">最大点数:</span>
            <select
              value={customLimit}
              onChange={(e) => setCustomLimit(Number(e.target.value))}
              className="px-2 py-1 bg-white border border-gray-300 rounded text-gray-800"
            >
              <option value={100}>100 点</option>
              <option value={200}>200 点</option>
              <option value={500}>500 点</option>
              <option value={1000}>1000 点</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded shadow-xs transition-colors"
          >
            {isLoading ? '加载中...' : '从 SQLite 查询'}
          </button>
        </form>
      )}

      {/* 3. Timeline Scrubber Slider */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-mono">{startTimeStr}</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-gray-800 font-mono font-bold text-xs border border-slate-200">
              <Clock className="w-3 h-3 text-amber-600" />
              {currentTimeStr}
            </span>
            <span className="font-mono text-gray-600">
              [ 帧 {totalFrames > 0 ? currentIndex + 1 : 0} / {totalFrames} ]
            </span>
          </div>
          <span className="font-mono">{endTimeStr}</span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentIndex}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={totalFrames === 0 || isLoading}
          className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 disabled:opacity-50"
        />
      </div>

      {/* 4. Playback Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
        {/* Playback Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Reset to Start */}
          <button
            onClick={onReset}
            disabled={totalFrames === 0}
            className="p-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shadow-xs"
            title="回到起点"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Step Back */}
          <button
            onClick={() => onStep(-1)}
            disabled={totalFrames === 0 || currentIndex <= 0}
            className="p-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shadow-xs"
            title="上一帧 (-1)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Main Play / Pause Button */}
          <button
            onClick={onTogglePlay}
            disabled={totalFrames === 0}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs text-white shadow-sm transition-all ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>暂停</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>播放</span>
              </>
            )}
          </button>

          {/* Step Forward */}
          <button
            onClick={() => onStep(1)}
            disabled={totalFrames === 0 || currentIndex >= totalFrames - 1}
            className="p-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shadow-xs"
            title="下一帧 (+1)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Jump to End */}
          <button
            onClick={() => onSeek(totalFrames - 1)}
            disabled={totalFrames === 0 || currentIndex >= totalFrames - 1}
            className="p-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shadow-xs"
            title="跳至最后一帧"
          >
            <FastForward className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 font-medium mr-1">倍速:</span>
          {[0.5, 1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                speed === s
                  ? 'bg-amber-500 text-white font-bold shadow-xs'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Current Frame Snapshot Pill */}
        {currentRecord && (
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
              水槽1: {currentRecord.temp_tank1?.toFixed(1)}°C
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-orange-800">
              水槽2: {currentRecord.temp_tank2?.toFixed(1)}°C
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800">
              压力: {currentRecord.pressure?.toFixed(2)} MPa
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
              流量: {currentRecord.flow_rate?.toFixed(2)} L/min
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
