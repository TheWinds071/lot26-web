import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Info,
  ListFilter,
  Plus,
  ShieldAlert,
  Sliders,
  Trash2,
  Zap,
} from 'lucide-react';
import type { AlarmEvent, AlarmRule, MetricType, TelemetryData } from '../types';
import { METRIC_DEFINITIONS } from '../types';
import { AlarmRuleModal } from './AlarmRuleModal';

interface AlarmLogsProps {
  alarms: AlarmEvent[];
  alarmRules?: AlarmRule[];
  currentTelemetry?: TelemetryData;
  onClearAlarms: () => void;
  onAddRule?: (rule: AlarmRule) => void;
  onUpdateRule?: (rule: AlarmRule) => void;
  onDeleteRule?: (ruleId: string) => void;
}

export const AlarmLogs: React.FC<AlarmLogsProps> = ({
  alarms,
  alarmRules = [],
  currentTelemetry,
  onClearAlarms,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'rules'>('events');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<AlarmRule | null>(null);

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

  const getLiveMetricVal = (m: MetricType): number | undefined => {
    if (!currentTelemetry) return undefined;
    switch (m) {
      case 'temp_tank1':
        return currentTelemetry.temp_tank1;
      case 'temp_tank2':
        return currentTelemetry.temp_tank2;
      case 'temperature':
        return currentTelemetry.temperature;
      case 'temp_diff':
        return Math.abs(currentTelemetry.temp_tank1 - currentTelemetry.temp_tank2);
      case 'pressure':
        return currentTelemetry.pressure;
      case 'flow_rate':
        return currentTelemetry.flow_rate;
      case 'water_level_tank1':
        return currentTelemetry.water_level_tank1;
      case 'water_level_tank2':
        return currentTelemetry.water_level_tank2;
      case 'water_level_diff':
        return Math.abs(
          (currentTelemetry.water_level_tank1 || 0) - (currentTelemetry.water_level_tank2 || 0)
        );
      default:
        return undefined;
    }
  };

  const isRuleTriggered = (rule: AlarmRule): boolean => {
    if (!rule.enabled || !currentTelemetry) return false;
    const val = getLiveMetricVal(rule.metric);
    if (val === undefined) return false;

    switch (rule.operator) {
      case '>':
        return val > rule.threshold;
      case '>=':
        return val >= rule.threshold;
      case '<':
        return val < rule.threshold;
      case '<=':
        return val <= rule.threshold;
      case '==':
        return Math.abs(val - rule.threshold) < 1e-4;
      case '!=':
        return Math.abs(val - rule.threshold) >= 1e-4;
      default:
        return false;
    }
  };

  const handleOpenAddModal = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rule: AlarmRule) => {
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const handleSaveRule = (rule: AlarmRule) => {
    if (editingRule && onUpdateRule) {
      onUpdateRule(rule);
    } else if (onAddRule) {
      onAddRule(rule);
    }
  };

  const handleDeleteRule = (ruleId: string, ruleName: string) => {
    if (window.confirm(`确定要删除报警规则 "${ruleName}" 吗？`)) {
      if (onDeleteRule) {
        onDeleteRule(ruleId);
      }
    }
  };

  const handleToggleRuleEnabled = (rule: AlarmRule) => {
    if (onUpdateRule) {
      onUpdateRule({ ...rule, enabled: !rule.enabled });
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 transition-all duration-200">
      {/* Header with Title, Tabs, and Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              告警与安全运行配置
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              System Audit, Active Alarms & Customizable Safety Rules
            </p>
          </div>
        </div>

        {/* Tab switcher + Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Tab Switcher */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'events'
                  ? 'bg-white text-gray-900 shadow-xs font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>实时告警</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  alarms.length > 0
                    ? 'bg-rose-500 text-white font-bold'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {alarms.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'bg-white text-gray-900 shadow-xs font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span>报警规则管理</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-bold">
                {alarmRules.length}
              </span>
            </button>
          </div>

          {/* Add Rule Button (Prominent) */}
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs hover:shadow transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加报警规则</span>
          </button>

          {/* Clear Alarms Button (Only in events tab) */}
          {activeTab === 'events' && alarms.length > 0 && (
            <button
              onClick={onClearAlarms}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-gray-300 hover:border-rose-200 shadow-xs transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空记录</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Active Alarms View */}
      {activeTab === 'events' && (
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
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
      )}

      {/* Tab 2: Alarm Rules Configuration View */}
      {activeTab === 'rules' && (
        <div className="space-y-3">
          {alarmRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                <ListFilter className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-800">暂无报警规则</p>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
                您可以点击右上角按钮添加自定义指标报警规则
              </p>
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>立即添加第一条规则</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {alarmRules.map((rule) => {
                const metricDef = METRIC_DEFINITIONS[rule.metric] || {
                  label: rule.metric,
                  unit: '',
                };
                const liveVal = getLiveMetricVal(rule.metric);
                const triggered = isRuleTriggered(rule);

                return (
                  <div
                    key={rule.id}
                    className={`rounded-xl border p-4 transition-all duration-200 ${
                      !rule.enabled
                        ? 'bg-slate-50/60 border-slate-200 opacity-70'
                        : triggered
                        ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-400 shadow-xs'
                        : 'bg-white border-gray-200 shadow-xs hover:border-blue-200'
                    }`}
                  >
                    {/* Top Row: Name, Status Badge, Level Badge */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-gray-900">{rule.name}</span>
                        {rule.is_system ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-normal">
                            内置
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 border border-blue-200 font-normal">
                            自定义
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Live state badge */}
                        {!rule.enabled ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 border border-gray-200">
                            已停用
                          </span>
                        ) : triggered ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                            告警中
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            正常
                          </span>
                        )}

                        {/* Level badge */}
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getBadgeClass(
                            rule.level
                          )}`}
                        >
                          {rule.level}
                        </span>
                      </div>
                    </div>

                    {/* Condition Row */}
                    <div className="flex items-center justify-between text-xs bg-slate-50/80 p-2 rounded-lg border border-slate-200 mb-2">
                      <div className="flex items-center gap-1.5 font-mono text-gray-800 font-medium">
                        <span className="font-sans text-gray-600">{metricDef.label}</span>
                        <span className="font-bold text-blue-600">{rule.operator}</span>
                        <span>
                          {rule.threshold} {metricDef.unit}
                        </span>
                      </div>

                      {liveVal !== undefined && (
                        <div className="text-[11px] font-mono text-gray-500">
                          实时: <span className="font-semibold text-gray-900">{liveVal.toFixed(1)}</span> {metricDef.unit}
                        </div>
                      )}
                    </div>

                    {/* Message description */}
                    {rule.message && (
                      <p className="text-[11px] text-gray-500 truncate mb-3" title={rule.message}>
                        {rule.message}
                      </p>
                    )}

                    {/* Bottom Row: Interlock Action & Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                      {/* Interlock Action */}
                      <div>
                        {rule.action && rule.action !== 'NONE' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Zap className="w-3 h-3 text-indigo-500" />
                            <span>
                              {rule.action === 'STOP_HEATER'
                                ? '联动切断加热'
                                : rule.action === 'STOP_PUMP'
                                ? '联动关停水泵'
                                : '系统紧急急停'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">仅告警提示 (无联动)</span>
                        )}
                      </div>

                      {/* Controls: Enable toggle, Edit, Delete */}
                      <div className="flex items-center gap-1.5">
                        {/* Toggle Enable Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleRuleEnabled(rule)}
                          title={rule.enabled ? '点击禁用规则' : '点击启用规则'}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            rule.enabled ? 'bg-blue-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              rule.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(rule)}
                          className="p-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="编辑规则"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id, rule.name)}
                          className="p-1 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="删除规则"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Alarm Rule Modal */}
      {isModalOpen && (
        <AlarmRuleModal
          key={editingRule?.id || 'new'}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaveRule={handleSaveRule}
          initialRule={editingRule}
          currentTelemetry={currentTelemetry}
        />
      )}
    </div>
  );
};
