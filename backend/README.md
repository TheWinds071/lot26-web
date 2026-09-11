# 🌊 Single-Pipe Dual-Tank Smart Water Circulation System - Backend

基于 FastAPI + 异步 TCP Server 的单管路双水槽智能水循环后端系统，使用 `uv` 进行环境与依赖管理。

## 物理与逻辑结构

- **2 个水槽**：水槽1（供水与加热主槽）与水槽2（工艺受水与循环槽）。
- **1 根连接管道**：连接水槽1与水槽2的单一管路。
- **双向水泵控制**：
  - `FORWARD`（正转）：水流由水槽1输送至水槽2。
  - `REVERSE`（反转）：水流由水槽2回抽至水槽1。
- **传感器**：水槽1温度、水槽2温度、单管路压力、单管路双向流量。

## 模块结构

- [`src/backend/main.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/main.py): FastAPI 主服务入口，支持 RESTful API 与 `/ws/telemetry` 实时 WebSocket 服务。
- [`src/backend/database.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/database.py): SQLite 历史时序数据与告警记录持久化管理中心（采用 WAL 模式与线程安全连接管理）。
- [`src/backend/tcp_server.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/tcp_server.py): 异步 TCP 服务端，支持 JSON/CSV 格式的传感器报文解析与下行 `pump_direction` 控制指令。
- [`src/backend/state_manager.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/state_manager.py): 状态管理中心、自动预载 SQLite 历史时序、水泵正反转闭环自控规则引擎。
- [`src/backend/models.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/models.py): Pydantic 数据模型定义（含 `pump_direction`）。
- [`simulator.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/simulator.py): 单管双水槽物理仿真客户端（模拟水泵正转 1➔2 / 反转 2➔1 下的流体输送与热混合）。
- [`client_test.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/client_test.py): 单管双水槽 TCP 报文发送测试脚本。

## 核心控制接口与 JSON 报文规范 (水泵与加热模块)

系统支持前端通过 **HTTP RESTful API** 或 **WebSocket** 发送执行器控制报文，后端接收并处理后，同步向底层 TCP 客户端/PLC 广播下行控制指令：

### 1. 水泵控制 (`Pump Control`)
- **HTTP 请求**：`POST /api/control/pump`
  ```json
  {
    "active": true,
    "speed": 60,
    "direction": "FORWARD"
  }
  ```
- **WebSocket 请求**：
  ```json
  {
    "action": "set_pump",
    "active": true,
    "speed": 60,
    "direction": "FORWARD"
  }
  ```
- **TCP 硬件广播指令**：
  ```json
  {
    "cmd": "PUMP_CONTROL",
    "pump_active": true,
    "pump_speed": 60,
    "pump_direction": "FORWARD"
  }
  ```

### 2. 加热模块控制 (`Heater Control`)
- **HTTP 请求**：`POST /api/control/heater`
  ```json
  {
    "active": true,
    "power": 100
  }
  ```
- **WebSocket 请求**：
  ```json
  {
    "action": "set_heater",
    "active": true,
    "power": 100
  }
  ```
- **TCP 硬件广播指令**：
  ```json
  {
    "cmd": "HEATER_CONTROL",
    "heater_active": true,
    "heater_power": 100
  }
  ```

## 历史数据 RESTful API

- `GET /api/history`: 获取近期待渲染历史记录（支持 `?limit=120&from_db=true`）。
- `GET /api/history/query`: 按时间区间分页查询 SQLite 历史时序数据（参数：`start_time`、`end_time`、`limit`、`offset`、`order`）。
- `GET /api/history/stats`: 获取时序历史统计指标汇总（采样总量、极值、各测项均值）。
- `GET /api/history/export`: 下载时序历史 CSV 报表（可按时间过滤）。
- `GET /api/alarms/history`: 查询 SQLite 持久化历史告警日志。

## 报警规则 RESTful API

- `GET /api/alarm-rules`: 获取所有配置的告警规则（支持内置预设与用户自定义规则）。
- `POST /api/alarm-rules`: 新增自定义报警规则（支持指标、比较符、阈值、告警级别、联动动作与自定义消息）。
- `PUT /api/alarm-rules/{rule_id}`: 修改或启停指定报警规则。
- `DELETE /api/alarm-rules/{rule_id}`: 删除指定报警规则。

## 常用命令

### 1. 安装/同步依赖
```bash
uv sync
```

### 2. 启动 FastAPI + TCP Server
```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 运行物理仿真客户端
```bash
uv run python simulator.py --interval 1.0
```
