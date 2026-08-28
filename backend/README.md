# 🌊 Smart Water Circulation System - Backend

基于 FastAPI + 异步 TCP Server 的智能水循环后端系统，使用 `uv` 进行环境与依赖管理。

## 模块结构

- [`src/backend/main.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/main.py): FastAPI 主服务入口，使用 `lifespan` 管理异步 TCP 服务的生命周期，提供 RESTful API 与 `/ws/telemetry` 实时 WebSocket 服务。
- [`src/backend/tcp_server.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/tcp_server.py): 异步 TCP 服务端，支持 JSON/CSV 格式的传感器报文解析与下行控制指令 ACK。
- [`src/backend/state_manager.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/state_manager.py): 状态管理中心与自动控制规则引擎，包含温度闭环自控、超温/超压/低流量防干烧联锁保护。
- [`src/backend/models.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/src/backend/models.py): Pydantic 数据模型定义。
- [`simulator.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/simulator.py): 具有真实水力与热工物理动态特性的 TCP 客户端仿真器。
- [`client_test.py`](file:///home/TheWinds/Study/WebProject/lot26/backend/client_test.py): 基础 TCP 报文发送测试脚本。

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
