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
        return <ShieldAlert className="alarm-icon-critical" size={16} />;
      case 'ERROR':
        return <AlertCircle className="alarm-icon-error" size={16} />;
      case 'WARNING':
        return <AlertTriangle className="alarm-icon-warning" size={16} />;
      default:
        return <Info className="alarm-icon-info" size={16} />;
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
    <div className="alarm-card">
      <div className="alarm-card-header">
        <div className="section-title-group">
          <AlertCircle className="section-title-icon" size={20} />
          <h3>告警与事件记录 ({alarms.length})</h3>
        </div>
        {alarms.length > 0 && (
          <button onClick={onClearAlarms} className="btn-clear-logs">
            <Trash2 size={14} />
            <span>清空记录</span>
          </button>
        )}
      </div>

      <div className="alarm-list-wrapper">
        {alarms.length === 0 ? (
          <div className="alarm-empty-state">
            <CheckCircle2 size={28} className="text-green" />
            <p>系统运行正常，当前无活动告警或异常事件</p>
          </div>
        ) : (
          <div className="alarm-list">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className={`alarm-item ${alarm.resolved ? 'alarm-item-resolved' : `alarm-item-${alarm.level.toLowerCase()}`}`}
              >
                <div className="alarm-item-left">
                  {getLevelIcon(alarm.level)}
                  <span className="alarm-time">{formatTime(alarm.timestamp)}</span>
                  <span className={`alarm-type-badge badge-${alarm.level.toLowerCase()}`}>
                    {alarm.type}
                  </span>
                </div>
                <div className="alarm-message">{alarm.message}</div>
                <div className="alarm-status-flag">
                  {alarm.resolved ? (
                    <span className="flag-resolved">已自愈/恢复</span>
                  ) : (
                    <span className="flag-active">处理中</span>
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
