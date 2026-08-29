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
- [`src/backend/tcp_server.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/tcp_server.py): 异步 TCP 服务端，支持 JSON/CSV 格式的传感器报文解析与下行 `pump_direction` 控制指令。
- [`src/backend/state_manager.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/state_manager.py): 状态管理中心与水泵正反转闭环自控规则引擎。
- [`src/backend/models.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/models.py): Pydantic 数据模型定义（含 `pump_direction`）。
- [`simulator.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/simulator.py): 单管双水槽物理仿真客户端（模拟水泵正转 1➔2 / 反转 2➔1 下的流体输送与热混合）。
- [`client_test.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/client_test.py): 单管双水槽 TCP 报文发送测试脚本。

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
