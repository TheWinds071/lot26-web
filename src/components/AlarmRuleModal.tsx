import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type {
  AlarmLevel,
  AlarmRule,
  MetricType,
  OperatorType,
  RuleAction,
  TelemetryData,
} from '../types';
import { METRIC_DEFINITIONS } from '../types';

interface AlarmRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRule: (rule: AlarmRule) => void;
  initialRule?: AlarmRule | null;
  currentTelemetry?: TelemetryData;
}

const PRESET_TEMPLATES: Array<{
  name: string;
  metric: MetricType;
  operator: OperatorType;
  threshold: number;
  level: AlarmLevel;
  action: RuleAction;
  message: string;
}> = [
  {
    name: '水槽1高温预警',
    metric: 'temp_tank1',
    operator: '>=',
    threshold: 70.0,
    level: 'ERROR',
    action: 'STOP_HEATER',
    message: '水槽1水温过高，已自动切断加热保护管路！',
  },
  {
    name: '水槽2高温预警',
    metric: 'temp_tank2',
    operator: '>=',
    threshold: 75.0,
    level: 'ERROR',
    action: 'STOP_HEATER',
    message: '水槽2加热槽水温超限，已自动切断加热！',
  },
  {
    name: '管道超压危险保护',
    metric: 'pressure',
    operator: '>=',
    threshold: 800000.0,
    level: 'CRITICAL',
    action: 'STOP_HEATER',
    message: '单管路循环压力超限（>=800kPa），存在爆管风险！',
  },
  {
    name: '微流防干烧保护',
    metric: 'flow_rate',
    operator: '<',
    threshold: 0.05,
    level: 'WARNING',
    action: 'STOP_HEATER',
    message: '单管路流速过低，为防止加热器干烧已自动切断加热！',
  },
  {
    name: '双水槽温差过大',
    metric: 'temp_diff',
    operator: '>=',
    threshold: 15.0,
    level: 'WARNING',
    action: 'NONE',
    message: '水槽1与水槽2温差过大，建议开启水泵加强循环！',
  },
  {
    name: '水槽1低水位报警',
    metric: 'water_level_tank1',
    operator: '<=',
    threshold: 20.0,
    level: 'WARNING',
    action: 'NONE',
    message: '水槽1水位已低于20%，请及时注入循环补水！',
  },
];

export const AlarmRuleModal: React.FC<AlarmRuleModalProps> = ({
  isOpen,
  onClose,
  onSaveRule,
  initialRule,
  currentTelemetry,
}) => {
  const [name, setName] = useState<string>(initialRule?.name || '');
  const [metric, setMetric] = useState<MetricType>(initialRule?.metric || 'temp_tank1');
  const [operator, setOperator] = useState<OperatorType>(initialRule?.operator || '>=');
  const [threshold, setThreshold] = useState<number>(initialRule?.threshold ?? 70);
  const [level, setLevel] = useState<AlarmLevel>(initialRule?.level || 'WARNING');
  const [action, setAction] = useState<RuleAction>(initialRule?.action || 'NONE');
  const [message, setMessage] = useState<string>(initialRule?.message || '');
  const [enabled, setEnabled] = useState<boolean>(initialRule?.enabled ?? true);

  if (!isOpen) return null;

  const currentDef = METRIC_DEFINITIONS[metric] || METRIC_DEFINITIONS.temp_tank1;

  // Helper to get live metric value
  const getLiveVal = (m: MetricType): number | undefined => {
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

  const liveVal = getLiveVal(metric);

  const applyPreset = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    setName(preset.name);
    setMetric(preset.metric);
    setOperator(preset.operator);
    setThreshold(preset.threshold);
    setLevel(preset.level);
    setAction(preset.action);
    setMessage(preset.message);
  };

  const generateDefaultMessage = () => {
    const opText =
      operator === '>'
        ? '大于'
        : operator === '>='
        ? '达到或超过'
        : operator === '<'
        ? '低于'
        : operator === '<='
        ? '达到或低于'
        : operator === '=='
        ? '等于'
        : '不等于';
    const actionText =
      action === 'STOP_HEATER'
        ? '，已自动切断加热'
        : action === 'STOP_PUMP'
        ? '，已自动停止水泵'
        : action === 'EMERGENCY_STOP'
        ? '，系统已触发紧急急停'
        : '';
    return `${currentDef.label}${opText}阈值 ${threshold} ${currentDef.unit}${actionText}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newRule: AlarmRule = {
      id: initialRule?.id || `rule_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      metric,
      operator,
      threshold: Number(threshold),
      level,
      message: message.trim() || generateDefaultMessage(),
      action,
      enabled,
      is_system: initialRule?.is_system ?? false,
      created_at: initialRule?.created_at || new Date().toISOString(),
    };

    onSaveRule(newRule);
    onClose();
  };

  const getLevelBadge = (lvl: AlarmLevel) => {
    switch (lvl) {
      case 'CRITICAL':
        return { bg: 'bg-rose-50 border-rose-200 text-rose-700', label: '紧急 (CRITICAL)' };
      case 'ERROR':
        return { bg: 'bg-orange-50 border-orange-200 text-orange-700', label: '严重 (ERROR)' };
      case 'WARNING':
        return { bg: 'bg-amber-50 border-amber-200 text-amber-700', label: '警告 (WARNING)' };
      default:
        return { bg: 'bg-blue-50 border-blue-200 text-blue-700', label: '提示 (INFO)' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl overflow-hidden animate-fadeIn">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              {initialRule ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {initialRule ? '编辑报警规则' : '添加报警规则'}
              </h3>
              <p className="text-xs text-gray-500">
                设置传感器指标监控条件、告警级别及自动化联动保护
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets (Only when adding new rule) */}
        {!initialRule && (
          <div className="px-6 pt-4 pb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>快速套用常用规则模板：</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => applyPreset(tpl)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 text-gray-700 transition-all cursor-pointer"
                >
                  + {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Rule Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 block">
              规则名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：水槽1水温过高报警、管道超压停泵保护"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white rounded-lg border border-gray-300 px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-xs"
            />
          </div>

          {/* Metric & Operator & Threshold (3-Column Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Metric Select */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                <span>监控指标</span>
                {liveVal !== undefined && (
                  <span className="text-[11px] font-mono text-blue-600 font-medium">
                    当前: {liveVal.toFixed(1)} {currentDef.unit}
                  </span>
                )}
              </label>
              <select
                value={metric}
                onChange={(e) => {
                  const m = e.target.value as MetricType;
                  setMetric(m);
                  setThreshold(METRIC_DEFINITIONS[m].defaultThreshold);
                }}
                className="w-full bg-white rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
              >
                {Object.values(METRIC_DEFINITIONS).map((def) => (
                  <option key={def.value} value={def.value}>
                    {def.label} ({def.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Operator Select */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">比较条件</label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as OperatorType)}
                className="w-full bg-white rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer font-mono"
              >
                <option value=">=">大于等于 ( &gt;= )</option>
                <option value=">">大于 ( &gt; )</option>
                <option value="<=">小于等于 ( &lt;= )</option>
                <option value="<">小于 ( &lt; )</option>
                <option value="==">等于 ( == )</option>
                <option value="!=">不等于 ( != )</option>
              </select>
            </div>

            {/* Threshold Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">
                触发阈值 ({currentDef.unit})
              </label>
              <div className="flex rounded-lg shadow-xs">
                <input
                  type="number"
                  step={currentDef.step}
                  required
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full bg-white rounded-l-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="bg-slate-50 border border-l-0 border-gray-300 px-3 py-2 text-gray-500 text-xs font-medium rounded-r-lg flex items-center">
                  {currentDef.unit}
                </span>
              </div>
            </div>
          </div>

          {/* Alarm Level (Segmented Radio) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 block">告警级别</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { lvl: 'INFO', label: '提示 (INFO)', color: 'text-blue-600', icon: Info },
                  {
                    lvl: 'WARNING',
                    label: '警告 (WARNING)',
                    color: 'text-amber-600',
                    icon: AlertTriangle,
                  },
                  { lvl: 'ERROR', label: '严重 (ERROR)', color: 'text-orange-600', icon: AlertCircle },
                  {
                    lvl: 'CRITICAL',
                    label: '紧急 (CRITICAL)',
                    color: 'text-rose-600',
                    icon: ShieldAlert,
                  },
                ] as const
              ).map(({ lvl, label, color, icon: Icon }) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    level === lvl
                      ? 'bg-blue-50/70 border-blue-500 text-blue-900 ring-1 ring-blue-500 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Interlock Safety Action */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
              <span>联动控制保护动作 (可选)</span>
              <span className="text-[11px] text-gray-500 font-normal">
                触发该告警时自动触发的安全操作
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { act: 'NONE', label: '仅记录提示', desc: '不执行执行器联动' },
                  { act: 'STOP_HEATER', label: '切断加热器', desc: '加热功率归零' },
                  { act: 'STOP_PUMP', label: '关停循环泵', desc: '停止水泵电机' },
                  { act: 'EMERGENCY_STOP', label: '触发系统急停', desc: '全设备强制关停' },
                ] as const
              ).map(({ act, label, desc }) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setAction(act)}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    action === act
                      ? 'bg-indigo-50/60 border-indigo-500 text-indigo-900 ring-1 ring-indigo-500 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 font-semibold text-xs">
                    <Zap className={`w-3 h-3 ${action === act ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <span>{label}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Alarm Message Template */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700">自定义告警消息文案</label>
              <button
                type="button"
                onClick={() => setMessage(generateDefaultMessage())}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                自动生成标准文案
              </button>
            </div>
            <input
              type="text"
              placeholder={generateDefaultMessage()}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-white rounded-lg border border-gray-300 px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
          </div>

          {/* Enabled Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <span className="text-xs font-semibold text-gray-800">立即启用该规则</span>
              <p className="text-[11px] text-gray-500">
                开启后，系统将每秒自动校验传感器上报数据并执行告警研判
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Real-time Preview Box */}
          <div className="p-3 rounded-lg bg-slate-50/70 border border-dashed border-gray-300 space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              告警触发预览 (Preview)
            </span>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-gray-200 shadow-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    getLevelBadge(level).bg
                  }`}
                >
                  {level}
                </span>
                <span className="text-xs font-medium text-gray-800">
                  {message.trim() || generateDefaultMessage()}
                </span>
              </div>
              {action !== 'NONE' && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  联动: {action === 'STOP_HEATER' ? '切断加热' : action === 'STOP_PUMP' ? '停水泵' : '系统急停'}
                </span>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{initialRule ? '保存修改' : '确认添加规则'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
