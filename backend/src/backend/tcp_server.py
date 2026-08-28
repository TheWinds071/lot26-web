import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Optional, Set

from backend.models import TelemetryData
from backend.state_manager import state_manager

logger = logging.getLogger("tcp_server")


class TCPServer:
    """Async TCP Server receiving telemetry from water circulation client."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8888):
        self.host = host
        self.port = port
        self.server: Optional[asyncio.Server] = None
        self._serve_task: Optional[asyncio.Task] = None
        self._active_clients: Set[asyncio.StreamWriter] = set()

    def parse_telemetry_payload(self, text: str) -> Optional[TelemetryData]:
        """Parses incoming JSON or formatted text telemetry payload."""
        text = text.strip()
        if not text:
            return None

        # 1. Try JSON format
        if text.startswith("{") and text.endswith("}"):
            try:
                data = json.loads(text)
                temp = float(data.get("temperature", data.get("temp", data.get("t", 0.0))))
                press = float(data.get("pressure", data.get("press", data.get("p", 0.0))))
                flow = float(data.get("flow_rate", data.get("flow", data.get("f", 0.0))))
                dev_id = str(data.get("device_id", data.get("dev", "PUMP_STATION_01")))
                return TelemetryData(
                    device_id=dev_id,
                    temperature=temp,
                    pressure=press,
                    flow_rate=flow,
                    timestamp=datetime.now(),
                )
            except Exception as e:
                logger.warning(f"[TCP Server] JSON parse error: {e}, payload: {text}")

        # 2. Try Key-Value or CSV format: e.g. "DATA,45.5,0.32,18.0" or "T:45.5,P:0.32,F:18.0"
        csv_match = re.search(r"(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)", text)
        if csv_match:
            try:
                t = float(csv_match.group(1))
                p = float(csv_match.group(2))
                f = float(csv_match.group(3))
                return TelemetryData(
                    device_id="PUMP_STATION_01",
                    temperature=t,
                    pressure=p,
                    flow_rate=f,
                    timestamp=datetime.now(),
                )
            except Exception as e:
                logger.warning(f"[TCP Server] CSV parse error: {e}")

        return None

    async def handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        client_address = writer.get_extra_info("peername")
        logger.info(f"[TCP Server] Client connected from: {client_address}")
        self._active_clients.add(writer)
        state_manager.tcp_client_connected = True

        buffer = ""
        try:
            while True:
                data = await reader.read(4096)
                if not data:
                    logger.info(f"[TCP Server] Client {client_address} disconnected.")
                    break

                buffer += data.decode("utf-8", errors="replace")
                
                # Support newline-delimited packets
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue

                    telemetry = self.parse_telemetry_payload(line)
                    if telemetry:
                        logger.info(
                            f"[TCP Server] Telemetry from {client_address}: "
                            f"Temp={telemetry.temperature:.1f}°C, "
                            f"Press={telemetry.pressure:.2f}MPa, "
                            f"Flow={telemetry.flow_rate:.1f}L/min"
                        )
                        # Process through auto-control engine & store state
                        state_manager.process_telemetry(telemetry)

                        # Downlink command response to client/PLC actuator
                        response = {
                            "status": "ACK",
                            "pump_active": state_manager.device_state.pump_active,
                            "pump_speed": state_manager.device_state.pump_speed,
                            "heater_active": state_manager.device_state.heater_active,
                            "heater_power": state_manager.device_state.heater_power,
                            "emergency_stop": state_manager.device_state.emergency_stop,
                            "auto_mode": state_manager.device_state.auto_mode,
                            "timestamp": datetime.now().isoformat(),
                        }
                        writer.write((json.dumps(response) + "\n").encode("utf-8"))
                        await writer.drain()
                    else:
                        logger.warning(f"[TCP Server] Unrecognized payload: {line}")
                        writer.write(b'{"status":"ERROR","message":"Invalid payload format"}\n')
                        await writer.drain()

        except asyncio.CancelledError:
            logger.info(f"[TCP Server] Handler for {client_address} cancelled.")
        except Exception as e:
            logger.error(f"[TCP Server] Error handling client {client_address}: {e}")
        finally:
            self._active_clients.discard(writer)
            if not self._active_clients:
                state_manager.tcp_client_connected = False
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def broadcast_downlink(self, command: dict) -> None:
        """Broadcasts manual control/override instruction to all connected TCP clients/PLCs."""
        payload = (json.dumps(command) + "\n").encode("utf-8")
        for writer in list(self._active_clients):
            try:
                writer.write(payload)
                await writer.drain()
            except Exception as e:
                logger.error(f"[TCP Server] Broadcast error: {e}")

    async def start(self) -> None:
        self.server = await asyncio.start_server(
            self.handle_client, self.host, self.port
        )
        addrs = ", ".join(str(sock.getsockname()) for sock in self.server.sockets)
        logger.info(f"[TCP Server] Server listening on {addrs}")
        self._serve_task = asyncio.create_task(self.server.serve_forever())

    async def stop(self) -> None:
        if self.server is not None:
            logger.info("[TCP Server] Shutting down TCP server...")
            self.server.close()
            await self.server.wait_closed()
            if self._serve_task is not None:
                self._serve_task.cancel()
                try:
                    await self._serve_task
                except asyncio.CancelledError:
                    pass
            logger.info("[TCP Server] TCP server stopped.")
