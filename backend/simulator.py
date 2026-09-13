import argparse
import asyncio
import json
import os
from pathlib import Path
import random
import sys
import time

try:
    import json5
except ImportError:
    json5 = None


def load_config_defaults():
    """Attempts to read defaults from config.json5."""
    candidates = [
        Path("config.json5"),
        Path("../config.json5"),
        Path(__file__).resolve().parent.parent / "config.json5",
    ]
    for p in candidates:
        if p.is_file() and json5:
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json5.load(f)
            except Exception:
                pass
    return {}


_CFG = load_config_defaults()
_TCP_CFG = _CFG.get("communication_protocols", {}).get("tcp_socket", {})
_CLIENT_DEFAULTS = _TCP_CFG.get("client_defaults", {})
_TELEMETRY_CFG = _TCP_CFG.get("telemetry_uplink", {})
_TANK1_CFG = _CFG.get("storage_tank", {})
_TANK2_CFG = _CFG.get("heating_tank", {})
_PIPE_CFG = _CFG.get("single_pipeline_network", {})


class SinglePipeDualTankSimulator:
    """Simulates physical dynamics of a single-pipe dual-tank water circulation system with bidirectional pump."""

    def __init__(
        self,
        host: str = _CLIENT_DEFAULTS.get("remote_host", "127.0.0.1"),
        port: int = int(_CLIENT_DEFAULTS.get("remote_port", 8888)),
        interval: float = float(_TELEMETRY_CFG.get("sampling_rate_hz", 1.0)),
        max_flow: float = float(_PIPE_CFG.get("bidirectional_pump", {}).get("max_flow_rate_lpm", 0.4)),
    ):
        self.host = host
        self.port = port
        self.interval = interval
        self.max_flow = max_flow

        # Physical state variables for 2 water tanks connected by 1 single pipe (from config.json5)
        self.temp_tank1 = float(_TANK1_CFG.get("temperature_monitoring", {}).get("nominal_temperature_celsius", 48.0))
        self.temp_tank2 = float(_TANK2_CFG.get("temperature_monitoring", {}).get("nominal_temperature_celsius", 32.0))
        self.water_level_tank1 = float(_TANK1_CFG.get("water_level_monitoring", {}).get("nominal_level_percentage", 75.0))
        self.water_level_tank2 = float(_TANK2_CFG.get("water_level_monitoring", {}).get("nominal_level_percentage", 65.0))

        self.ambient_temp = 22.0  # Ambient room temp (°C)
        self.pressure = 4000.0    # Single pipe pressure (Pa, idle)
        self.flow_rate = 0.0      # Pipe flow rate (L/min, idle)
        self.accumulated_volume = 0.0  # Accumulated total volume in Liters

        # Actuator states (updated via TCP server downlink ACKs)
        self.pump_active = False
        self.pump_direction = "FORWARD"  # "FORWARD" (1->2) or "REVERSE" (2->1)
        self.pump_speed = 60      # %
        self.heater_active = False
        self.heater_power = 0     # %
        self.emergency_stop = False

        # Simulation anomaly flags
        self.inject_high_temp = False
        self.inject_overpressure = False
        self.inject_dry_run = False

    def step_physics(self, dt: float = 1.0):
        """Calculates physical changes across the single pipe over time delta dt."""
        # 1. Pump, Pressure & Flow Dynamics in Single Pipe
        if self.emergency_stop or not self.pump_active:
            target_flow = 0.0
            target_pressure = 4000.0  # Pa
        else:
            speed_ratio = self.pump_speed / 100.0
            target_flow = speed_ratio * self.max_flow
            target_pressure = 12000.0 + speed_ratio * 46000.0  # Pa (12 ~ 58 kPa)

        if self.inject_overpressure:
            target_pressure = 950000.0  # Pa (950 kPa, Exceeds max 800 kPa)
        if self.inject_dry_run:
            target_flow = 0.01 if self.max_flow <= 1.0 else 1.2

        # Add slight natural measurement noise
        noise_flow = random.uniform(-0.005, 0.005) if self.max_flow <= 1.0 else random.uniform(-0.15, 0.15)
        self.flow_rate += (target_flow - self.flow_rate) * 0.4 + noise_flow
        self.flow_rate = max(0.0, self.flow_rate)

        self.pressure += (target_pressure - self.pressure) * 0.4 + random.uniform(-15.0, 15.0)
        self.pressure = max(0.0, self.pressure)

        # Accumulate volume when flow rate > 0
        if self.pump_active and self.flow_rate > 0.0:
            self.accumulated_volume += (self.flow_rate / 60.0) * dt

        # 2. Single-Pipe Bidirectional Thermodynamic & Liquid Transfer Dynamics
        if self.inject_high_temp:
            self.temp_tank1 += 2.0 * dt
            self.temp_tank2 += 1.5 * dt
        else:
            # Heater in Tank 2
            if self.heater_active and not self.emergency_stop:
                heat_power_factor = (self.heater_power / 100.0) * 1.6
                flow_factor = 1.0 if self.flow_rate < 5 else 30.0 / (self.flow_rate + 10.0)
                self.temp_tank2 += heat_power_factor * flow_factor * dt * 0.35
            else:
                # Natural cooling towards ambient
                self.temp_tank2 += (self.ambient_temp - self.temp_tank2) * 0.03 * dt

            # Tank 1 natural ambient cooling
            self.temp_tank1 += (self.ambient_temp - self.temp_tank1) * 0.02 * dt

            # Single-Pipe Water Transfer between Tank 1 and Tank 2
            if self.pump_active and self.flow_rate > 1.0:
                transfer_rate = min(0.35, (self.flow_rate / 30.0) * 0.15 * dt)
                if self.pump_direction == "FORWARD":
                    # FORWARD (1 -> 2): Water flows from Tank 1 into Tank 2
                    self.temp_tank2 += (self.temp_tank1 - self.temp_tank2) * transfer_rate
                    self.water_level_tank1 = max(30.0, self.water_level_tank1 - 0.2 * dt)
                    self.water_level_tank2 = min(90.0, self.water_level_tank2 + 0.2 * dt)
                else:
                    # REVERSE (2 -> 1): Hot water from Tank 2 flows into Tank 1
                    self.temp_tank1 += (self.temp_tank2 - self.temp_tank1) * transfer_rate
                    self.water_level_tank1 = min(90.0, self.water_level_tank1 + 0.2 * dt)
                    self.water_level_tank2 = max(30.0, self.water_level_tank2 - 0.2 * dt)

        self.temp_tank1 += random.uniform(-0.03, 0.03)
        self.temp_tank2 += random.uniform(-0.03, 0.03)

    async def run(self):
        print(f"🌊 [Simulator] Starting Single-Pipe Dual-Tank Circulation Simulator...")
        print(f"📡 [Simulator] Connecting to TCP Server at {self.host}:{self.port}...")

        while True:
            try:
                reader, writer = await asyncio.open_connection(self.host, self.port)
                print("✅ [Simulator] Connected to Backend TCP Server!")

                while True:
                    start_time = time.time()
                    self.step_physics(self.interval)

                    # Prepare dual-tank telemetry packet
                    payload = {
                        "device_id": "DUAL_TANK_STATION_01",
                        "temp_tank1": round(self.temp_tank1, 2),
                        "temp_tank2": round(self.temp_tank2, 2),
                        "temperature": round((self.temp_tank1 + self.temp_tank2) / 2.0, 2),
                        "pressure": round(self.pressure, 3),
                        "flow_rate": round(self.flow_rate, 2),
                        "total_volume": round(self.accumulated_volume, 3),
                        "water_level_tank1": round(self.water_level_tank1, 1),
                        "water_level_tank2": round(self.water_level_tank2, 1),
                    }
                    data_str = json.dumps(payload) + "\n"
                    writer.write(data_str.encode("utf-8"))
                    await writer.drain()

                    dir_label = "1➔2 正转" if self.pump_direction == "FORWARD" else "2➔1 反转"
                    print(
                        f"📤 Telemetry Sent -> Tank1: {payload['temp_tank1']:4.1f}°C | "
                        f"Tank2: {payload['temp_tank2']:4.1f}°C | "
                        f"Press: {payload['pressure']:6.0f}Pa | "
                        f"Flow: {payload['flow_rate']:5.2f}L/min | Vol: {self.accumulated_volume:5.2f}L | "
                        f"Pump: [{'ON' if self.pump_active else 'OFF'} {dir_label} ({self.pump_speed}%), "
                        f"Heater: {'ON' if self.heater_active else 'OFF'} ({self.heater_power}%)]"
                    )

                    # Read downlink feedback from TCP Server
                    try:
                        resp_data = await asyncio.wait_for(reader.readline(), timeout=self.interval * 1.5)
                        while resp_data:
                            line = resp_data.decode("utf-8").strip()
                            if line:
                                resp_json = json.loads(line)
                                # Apply server actuator state updates to simulation
                                if "pump_active" in resp_json:
                                    self.pump_active = resp_json["pump_active"]
                                if "pump_speed" in resp_json:
                                    self.pump_speed = resp_json["pump_speed"]
                                if "pump_direction" in resp_json:
                                    self.pump_direction = resp_json["pump_direction"]
                                if "heater_active" in resp_json:
                                    self.heater_active = resp_json["heater_active"]
                                if "heater_power" in resp_json:
                                    self.heater_power = resp_json["heater_power"]
                                if "emergency_stop" in resp_json:
                                    self.emergency_stop = resp_json["emergency_stop"]
                                if resp_json.get("target_volume_reached"):
                                    print("🎯 [Simulator] Target volume reached! Water pump auto-stopped by SCADA controller.")
                            # Drain any additional queued lines in reader buffer
                            if not reader.at_eof() and reader._buffer:
                                resp_data = await reader.readline()
                            else:
                                break
                    except asyncio.TimeoutError:
                        pass
                    except Exception as e:
                        print(f"⚠️ [Simulator] Error reading server response: {e}")

                    elapsed = time.time() - start_time
                    sleep_time = max(0.1, self.interval - elapsed)
                    await asyncio.sleep(sleep_time)

            except (ConnectionRefusedError, OSError) as e:
                print(f"❌ [Simulator] Cannot connect to {self.host}:{self.port} ({e}). Retrying in 2 seconds...")
                await asyncio.sleep(2.0)
            except Exception as e:
                print(f"⚠️ [Simulator] Connection error: {e}. Reconnecting in 2 seconds...")
                await asyncio.sleep(2.0)


def main():
    parser = argparse.ArgumentParser(description="Single-Pipe Dual-Tank TCP Client Simulator")
    parser.add_argument("--host", default="127.0.0.1", help="TCP server host")
    parser.add_argument("--port", type=int, default=8888, help="TCP server port")
    parser.add_argument("--interval", type=float, default=1.0, help="Reporting interval in seconds")
    parser.add_argument("--max-flow", type=float, default=0.4, help="Maximum flow rate (default: 0.4 L/min)")
    args = parser.parse_args()

    sim = SinglePipeDualTankSimulator(
        host=args.host,
        port=args.port,
        interval=args.interval,
        max_flow=args.max_flow,
    )
    try:
        asyncio.run(sim.run())
    except KeyboardInterrupt:
        print("\n🛑 [Simulator] Stopped.")


if __name__ == "__main__":
    main()
