import React, { useEffect, useState } from 'react';
import { Activity, AlertOctagon, Cpu, Radio, RefreshCw, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import type { SystemConfigResponse, SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  wsConnected: boolean;
  systemConfig?: SystemConfigResponse | null;
  onEmergencyStop: (stop: boolean) => void;
  onReloadConfig?: () => Promise<void> | void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  wsConnected,
  systemConfig,
  onEmergencyStop,
  onReloadConfig,
}) => {
  const [time, setTime] = useState<string>('');
  const [isReloading, setIsReloading] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('zh-CN', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleReloadClick = async () => {
    if (!onReloadConfig || isReloading) return;
    setIsReloading(true);
    try {
      await onReloadConfig();
    } finally {
      setTimeout(() => setIsReloading(false), 500);
    }
  };

  const isEmergency = status?.device_state.emergency_stop ?? false;
  const isTcpConnected = status?.tcp_client_connected ?? false;
  const autoMode = status?.device_state.auto_mode ?? false;
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
              {systemConfig?.config?.system?.system_name || '单管路双水槽智能水循环监测系统'}
            </h1>
          </div>
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
          <span>TCP采集: {isTcpConnected ? '已连接' : '等待连接'}</span>
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

        {/* Config Reload Icon Button (Single SVG Icon, Reload only) */}
        {systemConfig && (
          <button
            type="button"
            onClick={handleReloadClick}
            disabled={isReloading}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-blue-600 border border-slate-200 transition-all duration-200 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
            title={`重新加载配置 (读取最新 config.json5)\n当前文件: ${systemConfig.config_file || 'config.json5'}`}
            aria-label="重新加载配置 (config.json5)"
          >
            <RefreshCw className={`w-4 h-4 text-blue-600 ${isReloading ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Alarm Count Badge */}
        {alarmCount > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>{alarmCount} 条未恢复告警</span>
          </div>
        )}

        {/* Real-time Clock (HH:mm:ss without decimals) */}
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
