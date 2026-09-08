# 🌊 单管路双水槽智能水循环监测与自动控制系统 (Single-Pipe Bidirectional Dual-Tank SCADA)

本项目是一套集 **TCP 数据采集**、**单管路双向闭环自控规则引擎**、**SCADA 工业数字孪生大屏** 于一体的智能水循环监测与控制系统。

系统由 **2 个水槽**（水槽1 / 供水与加热主槽、水槽2 / 工艺与循环受水槽）构成，**两水槽之间仅由 1 根单管道连接**。管道上部署有 **可正反转双向水泵**、**管道压力传感器** 与 **双向管道流量计**，配合水槽1和水槽2内的 **2 个高精度温度传感器**，实现通过水泵的正转（水槽1 ➔ 水槽2）与反转（水槽2 ➔ 水槽1）精准调控水流输送方向、流量与水温平衡。

---

## 📑 目录

- [一、系统架构与单管路物理模型](#一系统架构与单管路物理模型)
- [二、核心功能特性](#二核心功能特性)
- [三、TCP 通信协议规范](#三tcp-通信协议规范)
- [四、单管路双向自动控制与安全联锁策略](#四单管路双向自动控制与安全联锁策略)
- [五、项目目录结构](#五项目目录结构)
- [六、快速启动与操作指南](#六快速启动与操作指南)
- [七、API 与 WebSocket 接口](#七api-与-websocket-接口)
- [八、前端组件开发手册 (初学者指引)](#八前端组件开发手册-初学者指引)

---

## 一、系统架构与单管路物理模型

### 1. 单管路物理拓扑
```
         ┌───────────────────┐                         ┌───────────────────┐
         │     水 槽 1        │                         │     水 槽 2        │
         │  (供水/恒温加热)   │                         │   (工艺/受水循环)  │
         │                   │                         │                   │
         │   [温度传感器 1]  │                         │   [温度传感器 2]  │
         │    [加热模块]     │                         │                   │
         └─────────┬─────────┘                         └─────────┬─────────┘
                   │                                             │
                   └───────[压力传感器]───[双向循环水泵]───[双向流量计]───────┘
                                   (单 根 连 接 管 道)
                        正转 (FORWARD): 水槽 1  ──────►  水槽 2
                        反转 (REVERSE): 水槽 1  ◄──────  水槽 2
```

### 2. 软件技术架构
```
+-------------------------------------------------------------+
|               TCP 采集客户端 (PLC/单管双水槽传感器模块)            |
|                      (或内置 Python 物理仿真器)               |
+-------------------------------------------------------------+
                              │
                 TCP Socket (0.0.0.0:8888)
          [上行遥测 JSON/CSV] ▲ ▼ [下行执行器控制指令 ACK]
                              │
+-------------------------------------------------------------+
|                   FastAPI 后端服务 (uv 管理)                 |
|  - 异步 TCP Server (Lifespan 并发调度与多客户端管理)           |
|  - 单管双槽状态管理器 (State Manager & 300 点时序滑动窗口)     |
|  - 水泵正反转与加热联锁引擎 (Bidirectional Auto-Control Engine)|
|  - WebSocket 广播推送服务 (/ws/telemetry)                    |
|  - RESTful 控制与阈值配置 API (/api/...)                      |
+-------------------------------------------------------------+
                              │
                 WebSocket (ws://.../ws/telemetry)
                              │
+-------------------------------------------------------------+
|             前端 SCADA 工业大屏 (React 19 + Vite + Tailwind)  |
|  - 水槽1水温、水槽2水温、单管压力、双向流量 四联高精度仪表卡片   |
|  - 单管路双向流体数字孪生拓扑 (SVG 正反转叶轮/水流粒子流向/加热特效)|
|  - 实时多通道波形趋势 (双槽水温对比曲线、压力曲线、流量曲线)     |
|  - 水泵正转 (1➔2) / 反转 (2➔1) 模式一键切换与转速滑块调节面板  |
|  - 双水槽温差预警与闭环安全阈值配置 (Min/Max Temp, Press, Flow) |
|  - 告警审计与自愈记录列表                                    |
|  - 一键紧急急停 (Emergency Stop) 联锁保护                    |
+-------------------------------------------------------------+
```

---

## 二、核心功能特性

1. **单管路双向水流与多参数监测**:
   - **水槽 1 水温**（$T_1$）：实时监测供水与加热主槽温度。
   - **水槽 2 水温**（$T_2$）：实时监测受水与工艺循环槽温度。
   - **单管压力**（$P$）：实时监测连接管道压力（$\text{Pa}$）。
   - **双向流量**（$F$）：实时监测水泵正转/反转下的流速（$\text{L/min}$）。
2. **水泵正反转双向控制**:
   - **正转模式（FORWARD）**：水泵将水槽1的温水加压泵送至水槽2。
   - **反转模式（REVERSE）**：水泵反向抽取水槽2的水体送回水槽1进行加热或回流。
3. **闭环恒温与安全联锁**:
   - 当水温低于设定阈值 $T_{\min}$ 时，联动开启水泵与加热模块。
   - 双水槽温差过大（$\|T_1 - T_2\| \ge \Delta T_{\max}$）时触发温差预警。
   - 管道压力超标（$\ge P_{\max}$）毫秒级联锁停泵停加热防爆管，低流量防干烧。
4. **数字孪生 SVG 拓扑仿真**:
   - 单根管道结构，水泵叶轮根据正反转（顺时针/逆时针）动态旋转。
   - 水流粒子与管道内流向指示箭头随正反转（$1\rightarrow 2$ 或 $2\rightarrow 1$）实时改变流动方向。

---

## 三、TCP 通信协议规范

TCP 服务端默认监听端口：`8888`（可通过环境变量 `TCP_PORT` 自定义）。

### 1. 客户端上行报文 (Telemetry -> Server)

支持两种格式（每条报文以换行符 `\n` 结尾）：

#### 格式 A：标准 JSON 报文（推荐）
```json
{
  "device_id": "DUAL_TANK_STATION_01",
  "temp_tank1": 48.0,
  "temp_tank2": 32.0,
  "pressure": 35000.0,
  "flow_rate": 0.35,
  "water_level_tank1": 75.0,
  "water_level_tank2": 65.0
}
```

#### 格式 B：CSV / 紧凑文本格式
4 字段格式（水槽1温度, 水槽2温度, 压力, 流量）：
```text
48.0, 32.0, 35000, 0.35
```

### 2. 服务端下行反馈与控制指令 (Server -> Client/PLC)

服务端接收数据后每帧自动返回下行 ACK 与当前执行器指令（含水泵正反转方向）：

```json
{
  "status": "ACK",
  "pump_active": true,
  "pump_speed": 60,
  "pump_direction": "FORWARD",
  "heater_active": true,
  "heater_power": 100,
  "emergency_stop": false,
  "auto_mode": true,
  "timestamp": "2026-08-29T14:02:06.057000"
}
```

---

## 四、单管路双向自动控制与安全联锁策略

| 保护/控制项 | 触发条件 | 动作与策略 | 告警级别 |
| :--- | :--- | :--- | :--- |
| **单管超压保护** | 压力 $\ge P_{\max}$ (默认 $800000\,\text{Pa}$) | 立即停止水泵与加热器，防止管道爆裂 | **CRITICAL** |
| **水槽超温保护** | 任一水槽水温 $\ge T_{\max}$ (默认 $75.0\,\text{°C}$) | 强制切断加热模块输出 | **ERROR** |
| **双槽温差预警** | $\|T_1 - T_2\| \ge \Delta T_{\max}$ (默认 $15.0\,\text{°C}$) | 触发温差过大预警，建议加大水泵正反转循环 | **WARNING** |
| **低流量/防干烧** | 水泵运行且流量 $< F_{\min}$ (默认 $5.0\,\text{L/min}$) | 强制切断加热模块输出，防止干烧损坏 | **WARNING** |
| **低温加热与输水** | 水温 $\le T_{\min}$ (默认 $45.0\,\text{°C}$) 且处于自控模式 | 启动水泵并开启加热器（100% 功率）促进双槽热交换 | **INFO** |
| **目标恒温到达** | 平均水温 $\ge T_{\text{target}}$ (默认 $55.0\,\text{°C}$) 且处于自控模式 | 自动关闭加热模块 | **INFO** |
| **紧急急停** | 外部急停按钮按下 | 强制锁定所有输出为 OFF，禁止手动启动 | **CRITICAL** |

---

## 五、项目目录结构

```text
lot26/
├── backend/                        # 后端项目 (FastAPI + TCP Server)
│   ├── pyproject.toml              # Python 项目依赖配置
│   ├── uv.lock                     # uv 依赖锁定文件
│   ├── README.md                   # 后端详细说明
│   ├── simulator.py                # 单管双槽物理水循环仿真器 (支持正反转)
│   ├── client_test.py              # TCP 基础通信测试脚本
│   └── src/
│       └── backend/
│           ├── __init__.py
│           ├── main.py             # FastAPI 应用入口与 REST/WebSocket 路由
│           ├── models.py           # 单管双槽数据模型与 Pydantic 校验
│           ├── state_manager.py    # 状态管理与正反转闭环自控规则引擎
│           └── tcp_server.py       # 异步 TCP 采集服务与下行指令响应
├── docs/                           # 项目设计与开发文档
│   └── COMPONENT_GUIDE.md          # 前端组件设计开发指南 (初学者手册)
├── src/                            # 前端 SCADA 可视化工程 (React + Vite + Tailwind)
│   ├── types.ts                    # TypeScript 类型定义
│   ├── App.tsx                     # 仪表盘主视图与状态调度
│   ├── index.css                   # 全局样式与 Tailwind v4
│   └── components/
│       ├── Header.tsx              # 顶部导航、状态指示灯与急停按钮
│       ├── TelemetryCards.tsx      # 水槽1/水槽2水温/压力/双向流量卡片
│       ├── PipelineTopology.tsx    # 单管双水槽动态 SVG 仿真 (含正反转流向动画)
│       ├── RealtimeCharts.tsx      # 多通道实时波形曲线 (双槽对比)
│       ├── ControlPanel.tsx        # 水泵正反转切换、转速调节与阈值表单
│       └── AlarmLogs.tsx           # 实时告警与事件日志
├── package.json
└── vite.config.ts                  # Vite 开发配置 (含 API & WS 代理)
```

---

## 六、快速启动与操作指南

### 1. 启动后端服务 (FastAPI + TCP Server)

打开终端 1：
```bash
cd backend
# 首次运行同步依赖
uv sync

# 启动后端 (API 端口: 8000, TCP 端口: 8888)
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. 启动前端可视化界面

打开终端 2：
```bash
# 根目录下启动 Vite 开发服务器
npm run dev
```
打开浏览器访问：`http://localhost:5173`。

### 3. 启动单管路双槽物理仿真客户端

打开终端 3：
```bash
cd backend
# 运行单管双槽物理仿真器 (模拟双水槽热交换、水泵正反转输水与管路压力/流量)
uv run python simulator.py --interval 1.0
```

---

## 七、API 与 WebSocket 接口

### 1. 核心控制接口与 JSON 报文规范 (水泵与加热模块)

前端控制面板点击开关、调节转速/功率或切换方向时，系统支持 **HTTP REST API** 与 **WebSocket** 两种途径发送控制 JSON。

#### (1) 点击单管路双向水泵开关与调速 (`Pump Control`)

**途径 A：HTTP RESTful POST**
- **请求地址**：`POST /api/control/pump`
- **请求头**：`Content-Type: application/json`
- **请求 JSON 报文**：
  ```json
  {
    "active": true,
    "speed": 60,
    "direction": "FORWARD"
  }
  ```
  - `active` (`boolean`, 必填)：水泵开关状态，`true` 为启动运行，`false` 为停止运行。
  - `speed` (`integer`, 可选)：水泵转速百分比，范围 `0` ~ `100`（默认 `60`）。
  - `direction` (`string`, 可选)：水流方向，`"FORWARD"` 为正转（水槽1 ➔ 水槽2），`"REVERSE"` 为反转（水槽2 ➔ 水槽1）。

**途径 B：WebSocket 双向通道 (`/ws/telemetry`)**
- **发送 JSON 报文**：
  ```json
  {
    "action": "set_pump",
    "active": true,
    "speed": 60,
    "direction": "FORWARD"
  }
  ```

**服务端响应与执行器下行：**
- **HTTP / WebSocket 响应的设备状态 JSON (`DeviceState`)**：
  ```json
  {
    "auto_mode": false,
    "pump_active": true,
    "pump_direction": "FORWARD",
    "pump_speed": 60,
    "heater_active": false,
    "heater_power": 0,
    "emergency_stop": false,
    "last_updated": "2026-09-08T16:35:00.123456"
  }
  ```
- **TCP 服务端向底层硬件/PLC 广播下发的控制指令 JSON**：
  ```json
  {
    "cmd": "PUMP_CONTROL",
    "pump_active": true,
    "pump_speed": 60,
    "pump_direction": "FORWARD"
  }
  ```

---

#### (2) 点击加热模块开关与功率调节 (`Heater Control`)

**途径 A：HTTP RESTful POST**
- **请求地址**：`POST /api/control/heater`
- **请求头**：`Content-Type: application/json`
- **请求 JSON 报文**：
  ```json
  {
    "active": true,
    "power": 100
  }
  ```
  - `active` (`boolean`, 必填)：加热模块开关状态，`true` 为开启加热，`false` 为关闭加热。
  - `power` (`integer`, 可选)：加热功率百分比，范围 `0` ~ `100`（开启默认 `100`，关闭设为 `0`）。

**途径 B：WebSocket 双向通道 (`/ws/telemetry`)**
- **发送 JSON 报文**：
  ```json
  {
    "action": "set_heater",
    "active": true,
    "power": 100
  }
  ```

**服务端响应与执行器下行：**
- **HTTP / WebSocket 响应的设备状态 JSON (`DeviceState`)**：
  ```json
  {
    "auto_mode": false,
    "pump_active": true,
    "pump_direction": "FORWARD",
    "pump_speed": 60,
    "heater_active": true,
    "heater_power": 100,
    "emergency_stop": false,
    "last_updated": "2026-09-08T16:35:00.123456"
  }
  ```
- **TCP 服务端向底层硬件/PLC 广播下发的控制指令 JSON**：
  ```json
  {
    "cmd": "HEATER_CONTROL",
    "heater_active": true,
    "heater_power": 100
  }
  ```

---

### 2. 其他 RESTful API 列表

- `GET /api/status`: 获取系统实时状态（含 telemetry、device_state、thresholds、active_alarms）
- `GET /api/history`: 获取近期待渲染遥测历史记录（`?limit=120&from_db=false`）
- `GET /api/history/query`: 分页与按时间范围查询 SQLite 历史时序数据
- `GET /api/history/stats`: 获取时序历史统计指标汇总（极值、均值等）
- `GET /api/history/export`: 导出时序历史 CSV 报表
- `GET /api/alarms`: 获取当前活跃告警
- `GET /api/alarms/history`: 获取 SQLite 持久化历史告警
- `DELETE /api/alarms`: 清空告警记录
- `POST /api/control/mode`: 切换模式 `{"auto_mode": true | false}`
- `POST /api/control/emergency_stop`: 触发/解除急停 `{"emergency_stop": true | false}`
- `GET /api/config/thresholds`: 获取自控阈值规则
- `POST /api/config/thresholds`: 更新并保存自控阈值规则

### 3. WebSocket 实时通信接口

- **连接端点**：`ws://localhost:8000/ws/telemetry`
- **下行推送事件类型**：
  - `init`: 首次建立连接时推送当前完整系统状态及历史数据
  - `telemetry`: 每次收到传感器数据后的实时状态全量推送
  - `device_state_updated`: 执行器动作、转速、方向变更推送
  - `thresholds_updated`: 阈值配置更新广播
  - `alarm`: 新增越限告警实时广播
  - `alarm_resolved`: 告警自愈与解除广播

---

## 八、前端组件开发手册 (初学者指引)

如果您是前端初学者，或者希望为系统扩展新的监控仪表、控制组件或矢量图元，请参阅：
👉 **[前端组件设计与开发指南 (docs/COMPONENT_GUIDE.md)](file:///home/TheWinds/Study/WebProject/lot26/docs/COMPONENT_GUIDE.md)**

该文档包含：
1. **添加新组件的标准 5 步流程**（定义类型 ➔ 编写组件 ➔ 主视图挂载 ➔ 状态绑定 ➔ 构建测试）；
2. **5 套即插即用的工业 SCADA 常用组件模板**（遥测指标卡片、状态指示灯、滑块开关、SVG 矢量阀门、审计表格）；
3. **Corporate Clean 设计规范与排坑指南**。
