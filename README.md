# 🌊 智能水循环监测与自动控制系统 (Smart Water Circulation System)

本项目是一套集 **TCP 数据采集**、**自动控制规则引擎**、**SCADA 可视化大屏** 于一体的智能水循环监测控制系统。系统实时采集管道**水温**、**管道压力**、**管道流量**，并根据设定条件自动调节循环水泵与加热模块，保障管路系统恒温安全运行。

---

## 📑 目录

- [一、系统架构与技术栈](#一系统架构与技术栈)
- [二、核心功能特性](#二核心功能特性)
- [三、TCP 通信协议规范](#三tcp-通信协议规范)
- [四、自动控制与联锁保护策略](#四自动控制与联锁保护策略)
- [五、项目目录结构](#五项目目录结构)
- [六、快速启动与操作指南](#六快速启动与操作指南)
- [七、API 与 WebSocket 接口](#七api-与-websocket-接口)

---

## 一、系统架构与技术栈

```
+-------------------------------------------------------------+
|                      TCP 采集客户端 (PLC/传感器)             |
|                      (或内置 Python 物理仿真器)              |
+-------------------------------------------------------------+
                              │
                 TCP Socket (0.0.0.0:8888)
          [上行遥测 JSON/CSV] ▲ ▼ [下行控制指令 ACK]
                              │
+-------------------------------------------------------------+
|                   FastAPI 后端服务 (uv 管理)                |
|  - 异步 TCP Server (Lifespan 并发调度)                       |
|  - 实时状态管理器 (State Manager & 内存时序缓冲)            |
|  - 智能自控与安全联锁引擎 (Auto-Control Engine)             |
|  - WebSocket 广播推送服务 (/ws/telemetry)                    |
|  - RESTful 控制与配置 API (/api/...)                         |
+-------------------------------------------------------------+
                              │
                 WebSocket (ws://.../ws/telemetry)
                              │
+-------------------------------------------------------------+
|                 前端 SCADA 可视化大屏 (React 19 + Vite)      |
|  - 水温、压力、流量 实时仪表卡片与安全状态指示              |
|  - 动态流体仿真管路拓扑图 (SVG 流速/加热特效联动)            |
|  - 实时多通道波形趋势图表 (40 采样窗口)                     |
|  - 自控/手动模式切换与执行器设定面板                        |
|  - 规则与安全阈值动态配置 (Min/Max Temp, Pressure, Flow)    |
|  - 告警事件记录与自愈监测列表                               |
|  - 一键紧急急停 (Emergency Stop) 保护                       |
+-------------------------------------------------------------+
```

### 技术选型

- **后端**: Python 3.14 + [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) + `asyncio`
- **包管理**: [uv](https://docs.astral.sh/uv/) (极速 Python 包与虚拟环境管理)
- **前端**: React 19 + TypeScript + Vite + Lucide React + SCADA Dark 工业主题
- **通信**: TCP Socket (底层遥测) + WebSocket (前端实时全双工流) + HTTP REST

---

## 二、核心功能特性

1. **三参数实时遥测采集**:
   - **水温**（$\text{°C}$）：实时监测循环回路温度，支持低温加热与超温告警。
   - **管道压力**（$\text{MPa}$）：监测管道运行压力，支持超压保护。
   - **管道流量**（$\text{L/min}$）：监测水流循环状态，支持低流量防干烧联锁。
2. **闭环自动恒温与水力控制**:
   - 智能识别当前工况，自动启闭加热器与循环水泵。
   - 超温/超压/低流量干烧时自动触发联锁停机保护。
3. **管路仿真拓扑图 (Digital Twin)**:
   - 纯矢量 SVG 动态渲染储水箱、水泵叶轮旋转（转速关联）、水流粒子动态（流速关联）、加热丝发热荧光特效与测点仪表。
4. **实时趋势与事件审计**:
   - 40 点滑动窗口实时曲线，支持全景三联视图与单项视图切换。
   - 告警级别分级（CRITICAL、ERROR、WARNING、INFO），支持自动恢复标志与一键清空。

---

## 三、TCP 通信协议规范

TCP 服务端默认监听端口：`8888`（可通过环境变量 `TCP_PORT` 自定义）。

### 1. 客户端上行报文 (Telemetry -> Server)

支持两种格式（每条数据以换行符 `\n` 结尾）：

#### 格式 A：标准 JSON 报文（推荐）
```json
{
  "device_id": "STATION_SMART_01",
  "temperature": 42.5,
  "pressure": 0.35,
  "flow_rate": 18.2
}
```

#### 格式 B：CSV / 紧凑文本格式
```text
42.5, 0.35, 18.2
```

### 2. 服务端下行反馈与控制指令 (Server -> Client/PLC)

服务端接收到采集数据并经由自控引擎评估后，每帧自动返回下行 ACK 与执行器当前指令：

```json
{
  "status": "ACK",
  "pump_active": true,
  "pump_speed": 60,
  "heater_active": true,
  "heater_power": 100,
  "emergency_stop": false,
  "auto_mode": true,
  "timestamp": "2026-08-29T00:36:12.632000"
}
```

---

## 四、自动控制与联锁保护策略

| 保护/控制项 | 触发条件 | 动作与策略 | 告警级别 |
| :--- | :--- | :--- | :--- |
| **管道超压保护** | 压力 $\ge P_{\max}$ (默认 $0.80\,\text{MPa}$) | 立即停止水泵与加热器，防止爆管 | **CRITICAL** |
| **超温保护** | 水温 $\ge T_{\max}$ (默认 $75.0\,\text{°C}$) | 强制切断加热模块输出 | **ERROR** |
| **低流量/防干烧** | 水泵运行且流量 $< F_{\min}$ (默认 $5.0\,\text{L/min}$) | 强制切断加热模块输出，防止干烧损坏 | **WARNING** |
| **自动恒温加热** | 水温 $\le T_{\min}$ (默认 $45.0\,\text{°C}$) 且处于自控模式 | 自动启动水泵循环并开启加热（100% 功率） | **INFO** |
| **目标恒温到达** | 水温 $\ge T_{\text{target}}$ (默认 $55.0\,\text{°C}$) 且处于自控模式 | 自动关闭加热模块 | **INFO** |
| **紧急急停** | 外部急停按钮按下 | 强制锁定所有输出为 OFF，禁止手动启动 | **CRITICAL** |

---

## 五、项目目录结构

```text
lot26/
├── backend/                        # 后端项目 (FastAPI + TCP Server)
│   ├── pyproject.toml              # Python 项目依赖配置
│   ├── uv.lock                     # uv 依赖锁定文件
│   ├── README.md                   # 后端详细说明
│   ├── simulator.py                # 物理水循环 TCP 仿真客户端
│   ├── client_test.py              # TCP 基础通信测试脚本
│   └── src/
│       └── backend/
│           ├── __init__.py
│           ├── main.py             # FastAPI 应用入口与 REST/WebSocket 路由
│           ├── models.py           # 数据结构与 Pydantic 模型
│           ├── state_manager.py    # 全局状态管理与自控规则引擎
│           └── tcp_server.py       # 异步 TCP 采集服务与报文解析
├── src/                            # 前端 SCADA 可视化工程 (React + Vite)
│   ├── types.ts                    # TypeScript 类型定义
│   ├── App.tsx                     # 仪表盘主视图与状态调度
│   ├── App.css                     # 工业 SCADA 大屏样式
│   ├── index.css                   # 全局样式与变量
│   └── components/
│       ├── Header.tsx              # 顶部导航、状态指示灯与急停按钮
│       ├── TelemetryCards.tsx      # 水温/压力/流量/执行器数据卡片
│       ├── PipelineTopology.tsx    # 动态流体管路拓扑图 (SVG 仿真)
│       ├── RealtimeCharts.tsx      # 多通道实时波形曲线
│       ├── ControlPanel.tsx        # 模式切换、远程控制与阈值规则表单
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
# 进入根目录安装前端依赖（首次）
npm install

# 启动 Vite 开发服务器
npm run dev
```
打开浏览器访问：`http://localhost:5173`。

### 3. 启动水循环物理仿真客户端

打开终端 3：
```bash
cd backend
# 运行物理仿真器 (模拟水温升降、水泵加压与流量动态)
uv run python simulator.py --interval 1.0
```

> **提示**：也可以使用自带的快速测试脚本：
> ```bash
> cd backend
> uv run python client_test.py '{"temperature": 41.2, "pressure": 0.35, "flow_rate": 18.0}'
> ```

---

## 七、API 与 WebSocket 接口

### REST 接口

- `GET /api/status`: 获取系统实时状态（遥测数据、执行器状态、当前阈值、告警列表、TCP客户端状态）
- `GET /api/history`: 获取近 120 组遥测时序数据
- `GET /api/alarms`: 获取告警历史
- `DELETE /api/alarms`: 清空告警记录
- `POST /api/control/mode`: 切换模式 `{"auto_mode": true | false}`
- `POST /api/control/pump`: 手动控制水泵 `{"active": true, "speed": 80}`
- `POST /api/control/heater`: 手动控制加热器 `{"active": true, "power": 100}`
- `POST /api/control/emergency_stop`: 触发/解除急停 `{"emergency_stop": true | false}`
- `GET /api/config/thresholds`: 获取自控阈值参数
- `POST /api/config/thresholds`: 修改保存自控阈值参数

### WebSocket 接口

- `ws://localhost:8000/ws/telemetry`: 全双工实时数据流推送与远程控制通道。
