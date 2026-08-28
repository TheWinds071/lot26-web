import React, { useEffect, useState } from 'react';
import { Activity, AlertOctagon, Cpu, Radio, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import type { SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  wsConnected: boolean;
  onEmergencyStop: (stop: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ status, wsConnected, onEmergencyStop }) => {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('zh-CN', { hour12: false }) +
          '.' +
          String(Math.floor(now.getMilliseconds() / 100)).padStart(1, '0')
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 200);
    return () => clearInterval(interval);
  }, []);

  const isEmergency = status?.device_state.emergency_stop ?? false;
  const isTcpConnected = status?.tcp_client_connected ?? false;
  const autoMode = status?.device_state.auto_mode ?? true;
  const alarmCount = status?.active_alarms?.length || 0;

  return (
    <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 flex flex-wrap items-center justify-between gap-4 transition-all duration-200">
      {/* Brand & System Title */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              智能水循环监测系统
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              SCADA v1.0
            </span>
          </div>
          <p className="text-xs text-gray-500 font-normal">
            Smart Water Circulation Monitoring & Auto-Control System
          </p>
        </div>
      </div>

      {/* Status Badges & Action Controls */}
      <div className="flex items-center flex-wrap gap-2.5">
        {/* TCP Ingestion Status */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-200 ${
            isTcpConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>TCP采集: {isTcpConnected ? '已连接' : '离线'}</span>
        </div>

        {/* WebSocket Push Status */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-200 ${
            wsConnected
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>实时推送: {wsConnected ? '在线' : '重连中'}</span>
        </div>

        {/* Control Mode Badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-200 ${
            autoMode
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>模式: {autoMode ? '智能自控' : '手动干预'}</span>
        </div>

        {/* Alarm Count Badge */}
        {alarmCount > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>{alarmCount} 条未恢复告警</span>
          </div>
        )}

        {/* Real-time Clock */}
        <div className="hidden lg:flex items-center px-3 py-1.5 rounded-lg bg-slate-50 border border-gray-200 text-xs font-mono text-gray-700">
          <span>{time}</span>
        </div>

        {/* Emergency Stop Button */}
        <button
          onClick={() => onEmergencyStop(!isEmergency)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-xs shadow-sm transition-all duration-200 active:scale-[0.98] focus:ring-2 focus:ring-offset-2 ${
            isEmergency
              ? 'bg-rose-700 hover:bg-rose-800 text-white ring-2 ring-rose-500 ring-offset-2 animate-bounce'
              : 'bg-rose-600 hover:bg-rose-700 text-white hover:shadow-md focus:ring-rose-500'
          }`}
          title={isEmergency ? "点击解除急停" : "强制关闭水泵和加热器"}
        >
          <AlertOctagon className="w-4 h-4" />
          <span>{isEmergency ? "急停已锁定 (点击解除)" : "紧急急停"}</span>
        </button>
      </div>
    </header>
  );
};
