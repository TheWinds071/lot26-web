import React, { useEffect, useRef, useState } from 'react';
import { AlarmLogs } from './components/AlarmLogs';
import { ControlPanel } from './components/ControlPanel';
import { Header } from './components/Header';
import { PipelineTopology } from './components/PipelineTopology';
import { RealtimeCharts } from './components/RealtimeCharts';
import { TelemetryCards } from './components/TelemetryCards';
import type { AlarmEvent, SystemStatus, TelemetryData, ThresholdConfig } from './types';

export const App: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [history, setHistory] = useState<TelemetryData[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Connect WebSocket
  const connectWebSocket = () => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

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
            setHistory(payload.history || []);
          } else if (payload.type === 'telemetry') {
            const newTelemetry: TelemetryData = payload.data.telemetry;
            const updatedStatus: SystemStatus = payload.data.status;
            setStatus(updatedStatus);
            setHistory((prev) => [...prev.slice(-120), newTelemetry]);
          } else if (payload.type === 'device_state_updated') {
            setStatus((prev) => (prev ? { ...prev, device_state: payload.data } : null));
          } else if (payload.type === 'thresholds_updated') {
            setStatus((prev) => (prev ? { ...prev, thresholds: payload.data } : null));
          } else if (payload.type === 'alarm') {
            const newAlarm: AlarmEvent = payload.data;
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

  const handleSetMode = async (autoMode: boolean) => {
    sendWsMessage({ action: 'set_mode', auto_mode: autoMode });
    try {
      await fetch('/api/control/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_mode: autoMode }),
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleControlPump = async (active: boolean, speed?: number) => {
    sendWsMessage({ action: 'set_pump', active, speed });
    try {
      await fetch('/api/control/pump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, speed }),
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

  const handleClearAlarms = async () => {
    try {
      await fetch('/api/alarms', { method: 'DELETE' });
      setStatus((prev) => (prev ? { ...prev, active_alarms: [] } : null));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 1. Header with System Overview & Quick Controls */}
        <Header
          status={status}
          wsConnected={wsConnected}
          onEmergencyStop={handleEmergencyStop}
        />

        {/* 2. Real-time Telemetry Metrics Cards */}
        <TelemetryCards
          telemetry={status?.telemetry}
          deviceState={status?.device_state}
          thresholds={status?.thresholds}
        />

        {/* 3. Visual SVG Pipeline Topology Schematic */}
        <PipelineTopology
          telemetry={status?.telemetry}
          deviceState={status?.device_state}
        />

        {/* 4. Real-time Waveform Dynamic Trends */}
        <RealtimeCharts history={history} />

        {/* 5. Control Center & Threshold Settings */}
        <ControlPanel
          deviceState={status?.device_state}
          thresholds={status?.thresholds}
          onSetMode={handleSetMode}
          onControlPump={handleControlPump}
          onControlHeater={handleControlHeater}
          onUpdateThresholds={handleUpdateThresholds}
        />

        {/* 6. Alarm & Event Logs */}
        <AlarmLogs
          alarms={status?.active_alarms || []}
          onClearAlarms={handleClearAlarms}
        />

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 py-4 border-t border-gray-200">
          Smart Water Circulation Monitoring & Auto-Control System &bull; Enterprise SCADA Edition
        </footer>
      </div>
    </div>
  );
};

export default App;
