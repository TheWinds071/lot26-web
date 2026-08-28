import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert, Trash2 } from 'lucide-react';
import type { AlarmEvent } from '../types';

interface AlarmLogsProps {
  alarms: AlarmEvent[];
  onClearAlarms: () => void;
}

export const AlarmLogs: React.FC<AlarmLogsProps> = ({ alarms, onClearAlarms }) => {
  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case 'ERROR':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const getBadgeClass = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'ERROR':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'WARNING':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('zh-CN', { hour12: false });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              告警与运行事件 ({alarms.length})
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              System Audit & Interlock Safety Logs
            </p>
          </div>
        </div>

        {alarms.length > 0 && (
          <button
            onClick={onClearAlarms}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-gray-300 hover:border-rose-200 shadow-xs transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空记录</span>
          </button>
        )}
      </div>

      <div className="overflow-hidden">
        {alarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-gray-700">系统运行正常</p>
            <p className="text-[11px] text-gray-500 mt-0.5">当前无未恢复告警或异常事件</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border transition-colors duration-200 hover:bg-slate-50/80 ${
                  alarm.resolved
                    ? 'bg-slate-50/50 border-slate-200 opacity-60'
                    : 'bg-white border-gray-200 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">{getLevelIcon(alarm.level)}</div>
                  <span className="font-mono text-xs text-gray-500">
                    {formatTime(alarm.timestamp)}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${getBadgeClass(
                      alarm.level
                    )}`}
                  >
                    {alarm.type}
                  </span>
                  <span className="text-xs font-medium text-gray-800">{alarm.message}</span>
                </div>

                <div className="text-xs">
                  {alarm.resolved ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      已自愈/恢复
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                      处理中
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
