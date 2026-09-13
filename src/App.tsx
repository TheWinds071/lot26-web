import React, { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { TelemetryCards } from './components/TelemetryCards';
import { PipelineTopology } from './components/PipelineTopology';
import { RealtimeCharts } from './components/RealtimeCharts';
import { ControlPanel } from './components/ControlPanel';
import { AlarmLogs } from './components/AlarmLogs';
import type { AlarmRule, DeviceState, SystemConfigResponse, SystemStatus, TelemetryData, ThresholdConfig } from './types';

export const App: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfigResponse | null>(null);
  const [alarmRules, setAlarmRules] = useState<AlarmRule[]>([]);
  const [history, setHistory] = useState<TelemetryData[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [historicalFrame, setHistoricalFrame] = useState<TelemetryData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Connect to backend WebSocket
  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/telemetry`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'init') {
            setStatus(payload.status);
            if (payload.status?.alarm_rules) {
              setAlarmRules(payload.status.alarm_rules);
            }
            if (payload.history) {
              setHistory(payload.history);
            }
          } else if (payload.type === 'alarm_rules_updated') {
            setAlarmRules(payload.data);
          } else if (payload.type === 'telemetry') {
            const telemetry: TelemetryData = payload.data.telemetry;
            const newStatus: SystemStatus = payload.data.status;
            setStatus((prev) => {
              if (!prev) return newStatus;
              const prevTh = prev.thresholds;
              const nextTh = newStatus.thresholds;
              const isSameTh =
                prevTh &&
                nextTh &&
                prevTh.temp_min === nextTh.temp_min &&
                prevTh.temp_target === nextTh.temp_target &&
                prevTh.temp_max === nextTh.temp_max &&
                prevTh.temp_diff_max === nextTh.temp_diff_max &&
                prevTh.pressure_min === nextTh.pressure_min &&
                prevTh.pressure_max === nextTh.pressure_max &&
                prevTh.flow_rate_min === nextTh.flow_rate_min &&
                prevTh.flow_rate_target === nextTh.flow_rate_target &&
                prevTh.target_volume === nextTh.target_volume &&
                prevTh.volume_control_enabled === nextTh.volume_control_enabled;

              return {
                ...newStatus,
                thresholds: isSameTh ? prevTh : nextTh,
              };
            });
            setHistory((prev) => [...prev.slice(-120), telemetry]);
          } else if (payload.type === 'history_cleared') {
            setHistory([]);
            setHistoricalFrame(null);
          } else if (payload.type === 'device_state_updated') {
            setStatus((prev) =>
              prev ? { ...prev, device_state: payload.data } : null
            );
          } else if (payload.type === 'mode_changed') {
            setStatus((prev) =>
              prev ? { ...prev, device_state: { ...prev.device_state, auto_mode: payload.data.auto_mode } } : null
            );
          } else if (payload.type === 'thresholds_updated') {
            setStatus((prev) =>
              prev ? { ...prev, thresholds: payload.data } : null
            );
          } else if (payload.type === 'alarm') {
            const newAlarm = payload.data;
            setStatus((prev) => {
              if (!prev) return null;
              const filtered = prev.active_alarms.filter((a) => a.id !== newAlarm.id);
              return { ...prev, active_alarms: [newAlarm, ...filtered] };
            });
          } else if (payload.type === 'alarm_resolved') {
            setStatus((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                active_alarms: prev.active_alarms.filter((a) => a.type !== payload.data.type),
              };
            });
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 2 seconds
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 2000);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
        ws.close();
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 2000);
      }
    }
  };

  // Initial REST fetch & periodic fallback
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data: SystemStatus = await res.json();
        setStatus(data);
      }
      const histRes = await fetch('/api/history?limit=60');
      if (histRes.ok) {
        const histData: TelemetryData[] = await histRes.json();
        setHistory(histData);
      }
      const rulesRes = await fetch('/api/alarm-rules');
      if (rulesRes.ok) {
        const rulesData: AlarmRule[] = await rulesRes.json();
        setAlarmRules(rulesData);
      }
      const configRes = await fetch('/api/config/system');
      if (configRes.ok) {
        const cfgData: SystemConfigResponse = await configRes.json();
        setSystemConfig(cfgData);
      }
    } catch {
      // Backend maybe starting up
    }
  };

  useEffect(() => {
    fetchStatus();
    connectWebSocket();

    const pollInterval = setInterval(() => {
      if (!wsConnected) {
        fetchStatus();
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);



  const sendWsMessage = (msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const handleAddAlarmRule = async (rule: AlarmRule) => {
    sendWsMessage({ action: 'add_alarm_rule', rule });
    try {
      const res = await fetch('/api/alarm-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        const created: AlarmRule = await res.json();
        setAlarmRules((prev) => {
          const exists = prev.some((r) => r.id === created.id);
          return exists ? prev.map((r) => (r.id === created.id ? created : r)) : [...prev, created];
        });
      }
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateAlarmRule = async (rule: AlarmRule) => {
    sendWsMessage({ action: 'update_alarm_rule', rule_id: rule.id, rule });
    try {
      const res = await fetch(`/api/alarm-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        const updated: AlarmRule = await res.json();
        setAlarmRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAlarmRule = async (ruleId: string) => {
    sendWsMessage({ action: 'delete_alarm_rule', rule_id: ruleId });
    try {
      const res = await fetch(`/api/alarm-rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAlarmRules((prev) => prev.filter((r) => r.id !== ruleId));
      }
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetMode = async (autoMode: boolean) => {
    sendWsMessage({ action: 'set_mode', auto_mode: autoMode });
    try {
      const res = await fetch('/api/control/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_mode: autoMode }),
      });
      if (res.ok) {
        const state: DeviceState = await res.json();
        setStatus((prev) => (prev ? { ...prev, device_state: state } : null));
      }
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleControlPump = async (
    active: boolean,
    speed?: number,
    direction?: 'FORWARD' | 'REVERSE'
  ) => {
    sendWsMessage({ action: 'set_pump', active, speed, direction });
    try {
      await fetch('/api/control/pump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, speed, direction }),
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleControlHeater = async (active: boolean, power?: number) => {
    sendWsMessage({ action: 'set_heater', active, power });
    try {
      await fetch('/api/control/heater', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, power }),
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEmergencyStop = async (emergencyStop: boolean) => {
    sendWsMessage({ action: 'set_emergency_stop', emergency_stop: emergencyStop });
    try {
      await fetch('/api/control/emergency_stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergency_stop: emergencyStop }),
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateThresholds = async (config: ThresholdConfig) => {
    sendWsMessage({ action: 'update_thresholds', thresholds: config });
    try {
      await fetch('/api/config/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetVolume = async () => {
    sendWsMessage({ action: 'reset_volume' });
    try {
      const res = await fetch('/api/control/reset-volume', { method: 'POST' });
      if (res.ok) {
        const state: DeviceState = await res.json();
        setStatus((prev) => (prev ? { ...prev, device_state: state } : null));
      }
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearAlarms = async () => {
    try {
      await fetch('/api/alarms', { method: 'DELETE' });
      setStatus((prev) => (prev ? { ...prev, active_alarms: [] } : null));
    } catch (e) {
      console.error(e);
    }
  };

  const handleReloadConfig = async () => {
    try {
      const res = await fetch('/api/config/reload', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSystemConfig({
          status: 'ok',
          config_file: systemConfig?.config_file || 'config.json5',
          config: data.config,
        });
      }
    } catch (e) {
      console.error('Failed to reload config:', e);
      throw e;
    }
  };

  const currentTelemetry = historicalFrame || status?.telemetry || undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-700">
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {/* 1. System Header with Live Badges and Emergency Stop */}
        <Header
          status={status}
          wsConnected={wsConnected}
          systemConfig={systemConfig}
          onEmergencyStop={handleEmergencyStop}
          onReloadConfig={handleReloadConfig}
        />

        {/* 2. Key Telemetry Metric Cards */}
        <TelemetryCards
          telemetry={currentTelemetry}
          deviceState={status?.device_state}
          thresholds={status?.thresholds}
          systemConfig={systemConfig}
        />

        {/* 3. Single-Pipe Bidirectional Digital Twin Topology */}
        <PipelineTopology
          telemetry={currentTelemetry}
          deviceState={status?.device_state}
          systemConfig={systemConfig}
        />

        {/* 4. Multi-Channel Trend Curves with Draggable Historical Timeline */}
        <RealtimeCharts
          history={history}
          onHistoricalFrameSelect={(record) => setHistoricalFrame(record)}
          onClearHistory={() => {
            setHistory([]);
            setHistoricalFrame(null);
          }}
        />

        {/* 5. Actuator Overrides & Closed-Loop Threshold Configuration */}
        <ControlPanel
          deviceState={status?.device_state}
          thresholds={status?.thresholds}
          onSetMode={handleSetMode}
          onControlPump={handleControlPump}
          onControlHeater={handleControlHeater}
          onUpdateThresholds={handleUpdateThresholds}
          onResetVolume={handleResetVolume}
        />

        {/* 6. Active Alarms & Configurable Alarm Rules Management */}
        <div id="alarm-logs-section">
          <AlarmLogs
            alarms={status?.active_alarms || []}
            alarmRules={alarmRules}
            currentTelemetry={currentTelemetry}
            onClearAlarms={handleClearAlarms}
            onAddRule={handleAddAlarmRule}
            onUpdateRule={handleUpdateAlarmRule}
            onDeleteRule={handleDeleteAlarmRule}
          />
        </div>

        {/* Footer */}
        <footer className="text-center py-4 text-xs text-gray-500 border-t border-gray-200">
          <p>
            单管路双水槽智能水循环控制系统 · Single-Pipe Bidirectional SCADA System · TCP Ingestion (Port 8888)
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
