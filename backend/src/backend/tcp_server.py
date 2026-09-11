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
    """Async TCP Server receiving dual-tank single-pipe telemetry from water circulation client."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8888):
        self.host = host
        self.port = port
        self.server: Optional[asyncio.Server] = None
        self._serve_task: Optional[asyncio.Task] = None
        self._active_clients: Set[asyncio.StreamWriter] = set()

    def parse_telemetry_payload(self, text: str) -> Optional[TelemetryData]:
        """Parses incoming JSON or formatted text telemetry payload for dual tanks."""
        text = text.strip()
        if not text:
            return None

        # 1. Try JSON format
        if text.startswith("{") and text.endswith("}"):
            try:
                data = json.loads(text)
                t1 = data.get("temp_tank1", data.get("tank1_temp", data.get("t1", None)))
                t2 = data.get("temp_tank2", data.get("tank2_temp", data.get("t2", None)))
                legacy_temp = data.get("temperature", data.get("temp", data.get("t", 45.0)))

                if t1 is None:
                    t1 = float(legacy_temp)
                else:
                    t1 = float(t1)

                if t2 is None:
                    t2 = float(legacy_temp)
                else:
                    t2 = float(t2)

                press = float(data.get("pressure", data.get("press", data.get("p", 0.0))))
                flow = float(data.get("flow_rate", data.get("flow", data.get("f", 0.0))))
                lvl1 = float(data.get("water_level_tank1", data.get("lvl1", 75.0)))
                lvl2 = float(data.get("water_level_tank2", data.get("lvl2", 65.0)))
                dev_id = str(data.get("device_id", data.get("dev", "DUAL_TANK_STATION_01")))

                return TelemetryData(
                    device_id=dev_id,
                    temp_tank1=t1,
                    temp_tank2=t2,
                    temperature=round((t1 + t2) / 2.0, 2),
                    pressure=press,
                    flow_rate=flow,
                    water_level_tank1=lvl1,
                    water_level_tank2=lvl2,
                    timestamp=datetime.now(),
                )
            except Exception as e:
                logger.warning(f"[TCP Server] JSON parse error: {e}, payload: {text}")

        # 2. Try Key-Value or CSV format:
        csv_4 = re.search(r"(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)", text)
        if csv_4:
            try:
                t1 = float(csv_4.group(1))
                t2 = float(csv_4.group(2))
                p = float(csv_4.group(3))
                f = float(csv_4.group(4))
                return TelemetryData(
                    device_id="DUAL_TANK_STATION_01",
                    temp_tank1=t1,
                    temp_tank2=t2,
                    temperature=round((t1 + t2) / 2.0, 2),
                    pressure=p,
                    flow_rate=f,
                    timestamp=datetime.now(),
                )
            except Exception as e:
                logger.warning(f"[TCP Server] CSV 4-field parse error: {e}")

        csv_3 = re.search(r"(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)", text)
        if csv_3:
            try:
                t = float(csv_3.group(1))
                p = float(csv_3.group(2))
                f = float(csv_3.group(3))
                return TelemetryData(
                    device_id="DUAL_TANK_STATION_01",
                    temp_tank1=t,
                    temp_tank2=t,
                    temperature=t,
                    pressure=p,
                    flow_rate=f,
                    timestamp=datetime.now(),
                )
            except Exception as e:
                logger.warning(f"[TCP Server] CSV 3-field parse error: {e}")

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

                    try:
                        telemetry = self.parse_telemetry_payload(line)
                        if telemetry:
                            logger.info(
                                f"[TCP Server] Telemetry from {client_address}: "
                                f"Tank1={telemetry.temp_tank1:.1f}°C, "
                                f"Tank2={telemetry.temp_tank2:.1f}°C, "
                                f"Press={telemetry.pressure:.0f}Pa, "
                                f"Flow={telemetry.flow_rate:.2f}L/min"
                            )
                            prev_heater_active = state_manager.device_state.heater_active
                            prev_heater_power = state_manager.device_state.heater_power

                            # Process through auto-control engine & store state
                            state_manager.process_telemetry(telemetry)

                            # Downlink command response to client/PLC actuator (same manual command structure, no auto_mode)
                            response = {
                                "status": "ACK",
                                "cmd": "HEATER_CONTROL",
                                "heater_active": state_manager.device_state.heater_active,
                                "heater_power": state_manager.device_state.heater_power,
                                "pump_active": state_manager.device_state.pump_active,
                                "pump_speed": state_manager.device_state.pump_speed,
                                "pump_direction": state_manager.device_state.pump_direction,
                                "emergency_stop": state_manager.device_state.emergency_stop,
                                "timestamp": datetime.now().isoformat(),
                            }
                            writer.write((json.dumps(response) + "\n").encode("utf-8"))
                            await writer.drain()

                            # If auto-control rule engine changed heater state, broadcast the explicit manual-style HEATER_CONTROL command
                            if (
                                state_manager.device_state.heater_active != prev_heater_active
                                or state_manager.device_state.heater_power != prev_heater_power
                            ):
                                logger.info(
                                    f"[Auto Control -> TCP Client] Heater state changed, sending manual command: "
                                    f"cmd=HEATER_CONTROL, active={state_manager.device_state.heater_active}, power={state_manager.device_state.heater_power}"
                                )
                                await self.broadcast_downlink({
                                    "cmd": "HEATER_CONTROL",
                                    "heater_active": state_manager.device_state.heater_active,
                                    "heater_power": state_manager.device_state.heater_power,
                                })
                        else:
                            logger.warning(f"[TCP Server] Unrecognized payload: {line}")
                            writer.write(b'{"status":"ERROR","message":"Invalid payload format"}\n')
                            await writer.drain()
                    except Exception as packet_err:
                        logger.error(f"[TCP Server] Error processing packet '{line}' from {client_address}: {packet_err}")
                        writer.write(b'{"status":"ERROR","message":"Internal processing error"}\n')
                        await writer.drain()

        except asyncio.CancelledError:
            logger.info(f"[TCP Server] Handler for {client_address} cancelled.")
        except Exception as e:
            logger.error(f"[TCP Server] Connection error with client {client_address}: {e}")
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
