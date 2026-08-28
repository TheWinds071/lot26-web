# Lot26 Backend

基于 FastAPI + 异步 TCP Server 的后端服务，使用 `uv` 进行环境与依赖管理。

## 目录结构

```text
backend/
├── client_test.py           # TCP 客户端测试脚本
├── pyproject.toml           # 项目依赖与元数据配置
├── uv.lock                  # 锁定版本文件
└── src/
    └── backend/
        ├── __init__.py
        ├── main.py          # FastAPI 主入口与生命周期管理 (启动/关闭 TCP 服务)
        └── tcp_server.py    # 异步 TCP Server 实现
```

## 快速启动

### 1. 安装依赖

进入 `backend` 目录：
```bash
cd backend
uv sync
```

### 2. 启动 FastAPI + TCP 服务

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

- **HTTP 接口**: `http://localhost:8000` (文档: `http://localhost:8000/docs`)
- **TCP 服务**: 默认监听 `0.0.0.0:8888`

### 3. 测试 TCP Client 发送消息

在另一个终端中运行测试脚本发送 TCP 消息：

```bash
uv run python client_test.py "Hello, TCP Server!"
```
