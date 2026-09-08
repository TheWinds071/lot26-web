import argparse
import asyncio
import json
import random
import sys
import time


class SinglePipeDualTankSimulator:
    """Simulates physical dynamics of a single-pipe dual-tank water circulation system with bidirectional pump."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8888, interval: float = 1.0):
        self.host = host
        self.port = port
        self.interval = interval

        # Physical state variables for 2 water tanks connected by 1 single pipe
        self.temp_tank1 = 48.0   # Tank 1 Temp (°C)
        self.temp_tank2 = 32.0   # Tank 2 Temp (°C)
        self.water_level_tank1 = 75.0  # Tank 1 level (%)
        self.water_level_tank2 = 65.0  # Tank 2 level (%)

        self.ambient_temp = 22.0  # Ambient room temp (°C)
        self.pressure = 0.04      # Single pipe pressure (MPa, idle)
        self.flow_rate = 0.0      # Pipe flow rate (L/min, idle)

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
            target_pressure = 0.04
        else:
            speed_ratio = self.pump_speed / 100.0
            target_flow = speed_ratio * 30.0
            target_pressure = 0.12 + speed_ratio * 0.46

        if self.inject_overpressure:
            target_pressure = 0.95  # Exceeds max 0.8 MPa
        if self.inject_dry_run:
            target_flow = 1.2       # Below min 5.0 L/min

        # Add slight natural measurement noise
        self.flow_rate += (target_flow - self.flow_rate) * 0.4 + random.uniform(-0.15, 0.15)
        self.flow_rate = max(0.0, self.flow_rate)

        self.pressure += (target_pressure - self.pressure) * 0.4 + random.uniform(-0.01, 0.01)
        self.pressure = max(0.0, self.pressure)

        # 2. Single-Pipe Bidirectional Thermodynamic & Liquid Transfer Dynamics
        if self.inject_high_temp:
            self.temp_tank1 += 2.0 * dt
            self.temp_tank2 += 1.5 * dt
        else:
            # Heater in Tank 1
            if self.heater_active and not self.emergency_stop:
                heat_power_factor = (self.heater_power / 100.0) * 1.6
                flow_factor = 1.0 if self.flow_rate < 5 else 30.0 / (self.flow_rate + 10.0)
                self.temp_tank1 += heat_power_factor * flow_factor * dt * 0.35
            else:
                # Natural cooling towards ambient
                self.temp_tank1 += (self.ambient_temp - self.temp_tank1) * 0.03 * dt

            # Single-Pipe Water Transfer between Tank 1 and Tank 2
            if self.pump_active and self.flow_rate > 1.0:
                transfer_rate = min(0.35, (self.flow_rate / 30.0) * 0.15 * dt)
                if self.pump_direction == "FORWARD":
                    # FORWARD (1 -> 2): Hot water flows from Tank 1 into Tank 2
                    self.temp_tank2 += (self.temp_tank1 - self.temp_tank2) * transfer_rate
                    self.water_level_tank1 = max(30.0, self.water_level_tank1 - 0.2 * dt)
                    self.water_level_tank2 = min(90.0, self.water_level_tank2 + 0.2 * dt)
                else:
                    # REVERSE (2 -> 1): Water flows from Tank 2 back into Tank 1
                    self.temp_tank1 += (self.temp_tank2 - self.temp_tank1) * transfer_rate
                    self.water_level_tank1 = min(90.0, self.water_level_tank1 + 0.2 * dt)
                    self.water_level_tank2 = max(30.0, self.water_level_tank2 - 0.2 * dt)
            else:
                # Tank 2 natural ambient cooling
                self.temp_tank2 += (self.ambient_temp - self.temp_tank2) * 0.02 * dt

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
                        f"Press: {payload['pressure']:4.2f}MPa | "
                        f"Flow: {payload['flow_rate']:5.2f}L/min | "
                        f"Pump: [{'ON' if self.pump_active else 'OFF'} {dir_label} ({self.pump_speed}%), "
                        f"Heater: {'ON' if self.heater_active else 'OFF'} ({self.heater_power}%)]"
                    )

                    # Read downlink feedback from TCP Server
                    try:
                        resp_data = await asyncio.wait_for(reader.readline(), timeout=self.interval * 1.5)
                        if resp_data:
                            resp_json = json.loads(resp_data.decode("utf-8").strip())
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
    args = parser.parse_args()

    sim = SinglePipeDualTankSimulator(host=args.host, port=args.port, interval=args.interval)
    try:
        asyncio.run(sim.run())
    except KeyboardInterrupt:
        print("\n🛑 [Simulator] Stopped.")


if __name__ == "__main__":
    main()
