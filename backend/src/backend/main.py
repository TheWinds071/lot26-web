import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.models import (
    AlarmEvent,
    DeviceState,
    SystemStatus,
    TelemetryData,
    ThresholdConfig,
)
from backend.state_manager import state_manager
from backend.tcp_server import TCPServer

logger = logging.getLogger("main")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

TCP_HOST = os.getenv("TCP_HOST", "0.0.0.0")
TCP_PORT = int(os.getenv("TCP_PORT", "8888"))

tcp_server = TCPServer(host=TCP_HOST, port=TCP_PORT)

# Active WebSocket connections
active_websockets: List[WebSocket] = []


def on_state_event(payload: dict):
    """Callback from StateManager to broadcast real-time updates to all frontend WebSockets."""
    if not active_websockets:
        return

    message = json.dumps(payload)
    disconnected = []
    for ws in list(active_websockets):
        try:
            asyncio.create_task(ws.send_text(message))
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        if ws in active_websockets:
            active_websockets.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register state event listener for WebSockets
    state_manager.subscribe(on_state_event)
    # Start TCP Server
    await tcp_server.start()
    yield
    # Cleanup
    state_manager.unsubscribe(on_state_event)
    await tcp_server.stop()


app = FastAPI(
    title="Smart Water Circulation Monitoring API & TCP Server",
    version="1.0.0",
    description="Backend service for Smart Water Circulation Monitoring System with TCP telemetry ingestion and auto-control",
    lifespan=lifespan,
)

# Enable CORS for Frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Models
class ModeRequest(BaseModel):
    auto_mode: bool


class PumpControlRequest(BaseModel):
    active: bool
    speed: Optional[int] = None


class HeaterControlRequest(BaseModel):
    active: bool
    power: Optional[int] = None


class EmergencyStopRequest(BaseModel):
    emergency_stop: bool


@app.get("/")
async def root():
    return {
        "status": "ok",
        "system": "Smart Water Circulation Monitoring System",
        "version": "1.0.0",
        "tcp_port": TCP_PORT,
    }


@app.get("/api/status", response_model=SystemStatus)
async def get_system_status():
    """Returns the current complete system status."""
    return state_manager.get_system_status()


@app.get("/api/history", response_model=List[TelemetryData])
async def get_history(limit: int = 120):
    """Returns recent telemetry time-series history for charts."""
    return state_manager.get_history(limit=limit)


@app.get("/api/alarms", response_model=List[AlarmEvent])
async def get_alarms(limit: int = 50):
    """Returns alarm and event logs."""
    return state_manager.get_alarms(limit=limit)


@app.delete("/api/alarms")
async def clear_alarms():
    """Clears alarm history."""
    state_manager.clear_alarms()
    return {"status": "success", "message": "Alarms cleared"}


@app.get("/api/config/thresholds", response_model=ThresholdConfig)
async def get_thresholds():
    """Returns auto-control threshold rules."""
    return state_manager.thresholds


@app.post("/api/config/thresholds", response_model=ThresholdConfig)
async def update_thresholds(config: ThresholdConfig):
    """Updates auto-control threshold rules."""
    updated = state_manager.update_thresholds(config)
    return updated


@app.post("/api/control/mode", response_model=DeviceState)
async def set_control_mode(req: ModeRequest):
    """Toggles Auto/Manual control mode."""
    return state_manager.set_auto_mode(req.auto_mode)


@app.post("/api/control/emergency_stop", response_model=DeviceState)
async def toggle_emergency_stop(req: EmergencyStopRequest):
    """Toggles emergency stop state."""
    state = state_manager.set_emergency_stop(req.emergency_stop)
    await tcp_server.broadcast_downlink({
        "cmd": "EMERGENCY_STOP",
        "emergency_stop": req.emergency_stop,
    })
    return state


@app.post("/api/control/pump", response_model=DeviceState)
async def control_pump(req: PumpControlRequest):
    """Manual pump control (on/off, speed)."""
    try:
        state = state_manager.control_pump(req.active, req.speed)
        await tcp_server.broadcast_downlink({
            "cmd": "PUMP_CONTROL",
            "pump_active": state.pump_active,
            "pump_speed": state.pump_speed,
        })
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/control/heater", response_model=DeviceState)
async def control_heater(req: HeaterControlRequest):
    """Manual heater control (on/off, power)."""
    try:
        state = state_manager.control_heater(req.active, req.power)
        await tcp_server.broadcast_downlink({
            "cmd": "HEATER_CONTROL",
            "heater_active": state.heater_active,
            "heater_power": state.heater_power,
        })
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """WebSocket endpoint for real-time telemetry streaming and live interaction."""
    await websocket.accept()
    active_websockets.append(websocket)
    logger.info(f"[WebSocket] Client connected: {websocket.client}")

    # Send initial state snapshot and recent history
    try:
        initial_payload = {
            "type": "init",
            "status": state_manager.get_system_status().model_dump(mode="json"),
            "history": [t.model_dump(mode="json") for t in state_manager.get_history(limit=100)],
        }
        await websocket.send_text(json.dumps(initial_payload))

        while True:
            # Handle incoming WebSocket commands from frontend
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                action = msg.get("action")
                if action == "set_mode":
                    state_manager.set_auto_mode(msg.get("auto_mode", True))
                elif action == "set_pump":
                    state_manager.control_pump(
                        msg.get("active", False), msg.get("speed")
                    )
                elif action == "set_heater":
                    state_manager.control_heater(
                        msg.get("active", False), msg.get("power")
                    )
                elif action == "set_emergency_stop":
                    state_manager.set_emergency_stop(msg.get("emergency_stop", False))
                elif action == "update_thresholds":
                    state_manager.update_thresholds(ThresholdConfig(**msg.get("thresholds", {})))
            except Exception as e:
                logger.error(f"[WebSocket] Command handling error: {e}")

    except WebSocketDisconnect:
        logger.info(f"[WebSocket] Client disconnected: {websocket.client}")
    except Exception as e:
        logger.error(f"[WebSocket] Connection error: {e}")
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
