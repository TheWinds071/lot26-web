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
    <header className="header-container">
      <div className="header-brand">
        <div className="brand-icon-wrapper">
          <Activity className="brand-icon" />
          <span className="brand-pulse"></span>
        </div>
        <div>
          <h1 className="brand-title">智能水循环监测与自动控制系统</h1>
          <p className="brand-subtitle">Smart Water Circulation Monitoring & Auto-Control SCADA</p>
        </div>
      </div>

      <div className="header-status-group">
        {/* TCP Client Link */}
        <div className={`status-badge ${isTcpConnected ? 'badge-online' : 'badge-offline'}`}>
          <Radio className="badge-icon" size={16} />
          <span>TCP采集端: {isTcpConnected ? '已连接' : '离线'}</span>
        </div>

        {/* WebSocket Link */}
        <div className={`status-badge ${wsConnected ? 'badge-online' : 'badge-offline'}`}>
          {wsConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>实时推送: {wsConnected ? '正常' : '重连中'}</span>
        </div>

        {/* Mode Badge */}
        <div className={`status-badge ${autoMode ? 'badge-auto' : 'badge-manual'}`}>
          <Cpu size={16} />
          <span>模式: {autoMode ? '智能自控' : '手动干预'}</span>
        </div>

        {/* Alarms Count */}
        {alarmCount > 0 && (
          <div className="status-badge badge-danger blink">
            <ShieldAlert size={16} />
            <span>{alarmCount} 条未恢复告警</span>
          </div>
        )}

        {/* Digital Clock */}
        <div className="clock-badge">
          <span>{time}</span>
        </div>

        {/* Emergency Stop Button */}
        <button
          onClick={() => onEmergencyStop(!isEmergency)}
          className={`btn-emergency ${isEmergency ? 'btn-emergency-active' : ''}`}
          title={isEmergency ? "点击解除急停" : "强制关闭水泵和加热器"}
        >
          <AlertOctagon size={18} />
          <span>{isEmergency ? "急停已锁定 (点击解除)" : "紧急急停"}</span>
        </button>
      </div>
    </header>
  );
};
