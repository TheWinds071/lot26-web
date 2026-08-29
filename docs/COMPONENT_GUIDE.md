# 📘 SCADA 工业前端组件设计与开发指南 (初学者手册)

欢迎来到 **智能水循环 SCADA 监控系统** 前端开发指南！本手册专门为初学者设计，详细解释系统的前端架构、如何一步步添加新组件，以及常用工业组件的代码模板与最佳实践。

---

## 📑 目录

1. [一、前端技术栈与架构概览](#一前端技术栈与架构概览)
2. [二、现有组件库与职责划分](#二现有组件库与职责划分)
3. [三、新手实战：添加新组件的标准 5 步流程](#三新手实战添加新组件的标准-5-步流程)
4. [四、工业 SCADA 常用组件代码模板 (即插即用)](#四工业-scada-常用组件代码模板-即插即用)
   - [模板 1：遥测指标卡片 (Metric Card)](#模板-1遥测指标卡片-metric-card)
   - [模板 2：状态指示灯与徽章 (Status Badge)](#模板-2状态指示灯与徽章-status-badge)
   - [模板 3：控制滑块与操作按钮组 (Control Slider & Button)](#模板-3控制滑块与操作按钮组-control-slider--button)
   - [模板 4：SVG 矢量管道/阀门图元 (SVG Valve/Pipe)](#模板-4svg-矢量管道阀门图元-svg-valvepipe)
   - [模板 5：事件日志与审计表格 (Event Table)](#模板-5事件日志与审计表格-event-table)
5. [五、企业级 UI 样式规范 (Corporate Clean)](#五企业级-ui-样式规范-corporate-clean)
6. [六、常见开发报错与排坑经验](#六常见开发报错与排坑经验)

---

## 一、前端技术栈与架构概览

- **框架核心**：[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)（强类型赋能，减少运行期 Bug）
- **构建工具**：[Vite](https://vitejs.dev/)（极速热重载与打包）
- **样式引擎**：[Tailwind CSS v4](https://tailwindcss.com/)（原子化 CSS，无需编写单独的 `.css` 文件）
- **图标库**：[Lucide React](https://lucide.dev/)（提供近千款现代工业与交互图标）
- **通信通道**：
  - **WebSocket** (`/ws/telemetry`)：全双工实时遥测推送（毫秒级刷新）。
  - **REST API** (`/api/...`)：用于页面初次加载、控制指令发送与阈值持久化配置。

### 数据流向示意图

```
                后端 (FastAPI + TCP Server)
                           │
       WebSocket (实时推送) │ REST API (配置/控制)
                           ▼
                 根组件 (src/App.tsx)
          [统一维护 status, history, websocket 状态]
                           │
         ┌────────────┬────┴───────┬────────────┐
         ▼            ▼            ▼            ▼
     [Header] [TelemetryCards] [Topology] [ControlPanel] ...
     (只读展示)   (只读展示)    (只读/动画)  (触发控制回调)
```

---

## 二、现有组件库与职责划分

所有组件均存放在 [`src/components/`](file:///home/TheWinds/Study/WebProject/lot26/src/components) 目录下：

| 组件文件 | 职责说明 | 典型 Props 入参 |
| :--- | :--- | :--- |
| [`Header.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/components/Header.tsx) | 顶栏状态区：系统标题、TCP/WS状态灯、当前时钟、一键紧急急停 | `status`, `wsConnected`, `onEmergencyStop` |
| [`TelemetryCards.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/components/TelemetryCards.tsx) | 核心指标区：水槽1水温、水槽2水温、单管压力、双向流量卡片 | `telemetry`, `deviceState`, `thresholds` |
| [`PipelineTopology.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/components/PipelineTopology.tsx) | 数字孪生区：单管路与双水槽 SVG 动态仿真、水泵正反转叶轮、粒子流向动画 | `telemetry`, `deviceState` |
| [`RealtimeCharts.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/components/RealtimeCharts.tsx) | 趋势波形区：双水槽温度对比曲线、压力趋势、流量多通道波形图 | `history` (数组) |
| [`ControlPanel.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/components/ControlPanel.tsx) | 控制与配置区：水泵正反转、转速滑块、加热器功率、自控阈值表单 | `deviceState`, `thresholds`, `onControlPump` 等回调 |
| [`AlarmLogs.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/components/AlarmLogs.tsx) | 报警记录区：展示未恢复与历史告警日志、严重级别徽章、一键清空 | `alarms`, `onClearAlarms` |

---

## 三、新手实战：添加新组件的标准 5 步流程

假设我们现在需要新增一个 **「能耗与水泵统计组件」 (`EnergyMeter.tsx`)**。

### 第 1 步：确定数据类型 (修改 `src/types.ts`)
如果新组件需要新的数据字段，先在 [`src/types.ts`](file:///home/TheWinds/Study/WebProject/lot26/src/types.ts) 中定义：

```typescript
// src/types.ts
export interface EnergyData {
  voltage: number;      // 电压 (V)
  current: number;      // 电流 (A)
  total_kwh: number;    // 累计耗电 (kWh)
}
```

### 第 2 步：新建组件文件 (创建 `src/components/EnergyMeter.tsx`)
在 `src/components/` 目录下创建新文件，遵循标准的 React 函数式组件结构：

```tsx
// src/components/EnergyMeter.tsx
import React from 'react';
import { Zap, Activity } from 'lucide-react';
import type { DeviceState, TelemetryData } from '../types';

// 1. 定义该组件接受的 Props 接口
interface EnergyMeterProps {
  telemetry?: TelemetryData;
  deviceState?: DeviceState;
}

// 2. 编写组件函数
export const EnergyMeter: React.FC<EnergyMeterProps> = ({
  telemetry,
  deviceState,
}) => {
  // 根据水泵功率计算估算瞬时功率 (kW)
  const pumpSpeed = deviceState?.pump_speed ?? 0;
  const isPumpActive = deviceState?.pump_active ?? false;
  const instantPowerKw = isPumpActive ? (pumpSpeed / 100) * 1.5 : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 transition-all duration-200">
      {/* 头部标题区 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-gray-900">
              电能与功耗分析
            </h3>
            <p className="text-xs text-gray-500 font-normal">
              Power Consumption & Pump Load
            </p>
          </div>
        </div>
      </div>

      {/* 内容数据区 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-xs text-gray-500 block">瞬时功率</span>
          <span className="text-xl font-bold font-mono text-gray-900">
            {instantPowerKw.toFixed(2)}
          </span>
          <span className="text-xs text-gray-500 ml-1">kW</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-xs text-gray-500 block">工作负荷</span>
          <span className="text-xl font-bold font-mono text-blue-600">
            {isPumpActive ? `${pumpSpeed}%` : '0%'}
          </span>
        </div>
      </div>
    </div>
  );
};
```

### 第 3 步：在主视图中引入 (修改 `src/App.tsx`)
打开 [`src/App.tsx`](file:///home/TheWinds/Study/WebProject/lot26/src/App.tsx)：

```tsx
// 1. 顶部导入组件
import { EnergyMeter } from './components/EnergyMeter';

// 2. 在 JSX 布局中放置组件
return (
  <div className="min-h-screen bg-slate-50 text-gray-900 flex flex-col font-sans">
    <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
      <Header ... />
      <TelemetryCards ... />
      
      {/* 新增的新组件 */}
      <EnergyMeter
        telemetry={status?.telemetry}
        deviceState={status?.device_state}
      />

      <PipelineTopology ... />
      ...
    </div>
  </div>
);
```

### 第 4 步：本地构建与校验
在项目根目录运行命令检查 TypeScript 类型与语法是否有误：
```bash
npm run build
```
若提示 `✓ built in xxxms` 则说明编写完全正确！

### 第 5 步：提交 Git 变更
```bash
git add src/ && git commit -m "feat(frontend): add EnergyMeter component for power monitoring"
```

---

## 四、工业 SCADA 常用组件代码模板 (即插即用)

### 模板 1：遥测指标卡片 (Metric Card)
适合用于展示水温、流量、气压、转速等带有单位和状态指示灯的卡片：

```tsx
import React from 'react';
import { Gauge } from 'lucide-react';

interface MetricCardProps {
  title: string;
  subTitle: string;
  value: number;
  unit: string;
  statusText: string;
  statusType: 'success' | 'warning' | 'danger';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  subTitle,
  value,
  unit,
  statusText,
  statusType,
}) => {
  const badgeColors = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between hover:shadow-md transition-all duration-200">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <Gauge className="w-5 h-5" />
          </div>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${badgeColors[statusType]}`}>
            {statusText}
          </span>
        </div>
        <span className="text-xs text-gray-500 font-medium">{title}</span>
        <div className="flex items-baseline gap-1 mt-1 mb-2">
          <span className="text-2xl font-bold font-mono text-gray-900 tracking-tight">
            {value.toFixed(1)}
          </span>
          <span className="text-xs text-gray-500 font-medium">{unit}</span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">{subTitle}</p>
    </div>
  );
};
```

---

### 模板 2：状态指示灯与徽章 (Status Badge)
适合用于展示通讯连接（TCP/WS/串口）或设备工作模式：

```tsx
import React from 'react';
import { Radio } from 'lucide-react';

export const StatusBadge: React.FC<{ isOnline: boolean; label: string }> = ({ isOnline, label }) => {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-200 ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'
      }`}
    >
      <Radio className="w-3.5 h-3.5" />
      <span>{label}: {isOnline ? '正常在线' : '通讯断开'}</span>
    </div>
  );
};
```

---

### 模板 3：控制滑块与操作按钮组 (Control Slider & Button)
适合用于手动调节阀门开度、水泵转速或加热功率：

```tsx
import React from 'react';
import { Power } from 'lucide-react';

interface SliderControlProps {
  label: string;
  value: number;
  isActive: boolean;
  onToggle: (active: boolean) => void;
  onChangeValue: (val: number) => void;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  isActive,
  onToggle,
  onChangeValue,
}) => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <button
          onClick={() => onToggle(!isActive)}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border shadow-xs transition-all ${
            isActive
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{isActive ? '运行中' : '已停机'}</span>
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-600">
          <span>输出设定</span>
          <span className="font-mono font-bold text-gray-900">{value}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={value}
          onChange={(e) => onChangeValue(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </div>
    </div>
  );
};
```

---

### 模板 4：SVG 矢量管道/阀门图元 (SVG Valve/Pipe)
在工业拓扑图中嵌入自定义阀门或管道元器件：

```tsx
import React from 'react';

export const SvgSolenoidValve: React.FC<{ x: number; y: number; isOpen: boolean }> = ({ x, y, isOpen }) => {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* 阀体双三角 */}
      <polygon points="0,0 24,12 0,24" fill={isOpen ? '#10b981' : '#ef4444'} />
      <polygon points="48,0 24,12 48,24" fill={isOpen ? '#10b981' : '#ef4444'} />
      {/* 阀杆与线圈 */}
      <line x1="24" y1="12" x2="24" y2="-10" stroke="#64748b" strokeWidth="2" />
      <rect x="16" y="-18" width="16" height="10" rx="2" fill="#334155" />
      <text x="24" y="36" fill="#64748b" fontSize="9" textAnchor="middle">
        {isOpen ? '开阀' : '关阀'}
      </text>
    </g>
  );
};
```

---

### 模板 5：事件日志与审计表格 (Event Table)
标准的企业级日志表格，包含斑马纹、状态圆点与时间戳格式化：

```tsx
import React from 'react';

interface EventItem {
  id: string;
  time: string;
  source: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export const EventTable: React.FC<{ events: EventItem[] }> = ({ events }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 font-semibold text-sm text-gray-800">
        系统操作与事件审计日志
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-gray-500 border-b border-gray-200">
            <tr>
              <th className="py-2.5 px-4 font-medium">时间</th>
              <th className="py-2.5 px-4 font-medium">事件源</th>
              <th className="py-2.5 px-4 font-medium">详细信息</th>
              <th className="py-2.5 px-4 font-medium">级别</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((evt) => (
              <tr key={evt.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2.5 px-4 font-mono text-gray-600">{evt.time}</td>
                <td className="py-2.5 px-4 font-medium text-gray-800">{evt.source}</td>
                <td className="py-2.5 px-4 text-gray-600">{evt.message}</td>
                <td className="py-2.5 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                    evt.level === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {evt.level.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

---

## 五、企业级 UI 样式规范 (Corporate Clean)

本项目严格遵循 **Corporate Clean** 风格体系：

1. **背景底色**：页面全局使用浅灰色 `bg-slate-50`，卡片使用纯白 `bg-white`。
2. **圆角与边框**：所有主卡片统一使用 `rounded-xl border border-gray-200 shadow-sm`。
3. **主色调与强调色**：
   - 品牌/信息：`blue-600`（`#2563eb`）
   - 成功/正常：`emerald-600`（`#059669`）
   - 警告/注意：`amber-600`（`#d97706`）
   - 危险/急停：`rose-600`（`#e11d48`）
4. **排版与字体**：
   - 文本标题：`font-semibold tracking-tight text-gray-900`
   - 数值与测量量：统一使用等宽字体 `font-mono font-bold`（如 `font-mono text-3xl`）。
5. **交互反馈**：按键添加微交互 `active:scale-[0.98] transition-all duration-200`。

---

## 六、常见开发报错与排坑经验

### 1. `error TS6133: 'xxx' is declared but its value is never read.`
- **原因**：导入了某个图标或变量但未在代码中使用（TypeScript 启用了严格模式）。
- **解决**：删除未使用的 `import` 即可。

### 2. `error TS2322: Type '...' is not assignable to type '...'`
- **原因**：父组件传入的属性（Prop）与子组件接口定义的名称不一致。
- **解决**：检查子组件的 `interface XxxProps`，确保名称与类型一致。

### 3. 数据初次加载时报 `TypeError: Cannot read properties of undefined`
- **原因**：后端在刚启动时 WebSocket 或 REST 尚未返回数据，`status?.telemetry` 为空。
- **解决**：使用 TypeScript 可选链与默认值保护：
  ```typescript
  const temp = telemetry?.temp_tank1 ?? 0;
  ```

---

> 💡 **小贴士**：开发新组件时，建议开启终端运行 `npm run dev`，保存文件即可在浏览器看到秒级热更新效果！
