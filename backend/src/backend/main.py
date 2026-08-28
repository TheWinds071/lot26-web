import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.tcp_server import TCPServer

TCP_HOST = os.getenv("TCP_HOST", "0.0.0.0")
TCP_PORT = int(os.getenv("TCP_PORT", "8888"))

tcp_server = TCPServer(host=TCP_HOST, port=TCP_PORT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start TCP Server on FastAPI startup
    await tcp_server.start()
    yield
    # Stop TCP Server on FastAPI shutdown
    await tcp_server.stop()


app = FastAPI(
    title="Lot26 Backend API & TCP Server",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "FastAPI service is running",
        "tcp_server": {
            "host": TCP_HOST,
            "port": TCP_PORT,
        },
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
