import argparse
import asyncio
import json
import random
import sys
import time


class WaterCirculationSimulator:
    """Simulates physical dynamics of a water circulation loop with sensors and actuators."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8888, interval: float = 1.0):
        self.host = host
        self.port = port
        self.interval = interval

        # Physical state variables
        self.temperature = 38.0  # Initial water temp (°C)
        self.ambient_temp = 24.0  # Ambient room temp (°C)
        self.pressure = 0.35     # MPa
        self.flow_rate = 18.0    # L/min

        # Actuator states (updated via TCP server downlink ACKs)
        self.pump_active = True
        self.pump_speed = 60      # %
        self.heater_active = False
        self.heater_power = 0     # %
        self.emergency_stop = False

        # Simulation anomaly flags
        self.inject_high_temp = False
        self.inject_overpressure = False
        self.inject_dry_run = False

    def step_physics(self, dt: float = 1.0):
        """Calculates physical changes over time delta dt."""
        # 1. Pump and Flow / Pressure Dynamics
        if self.emergency_stop or not self.pump_active:
            target_flow = 0.0
            target_pressure = 0.05
        else:
            # Flow proportional to pump speed (max ~ 35 L/min at 100% speed)
            speed_ratio = self.pump_speed / 100.0
            target_flow = speed_ratio * 30.0
            # Pressure proportional to pump speed
            target_pressure = 0.10 + speed_ratio * 0.45

        if self.inject_overpressure:
            target_pressure = 0.95  # Exceeds max 0.8 MPa
        if self.inject_dry_run:
            target_flow = 1.2       # Below min 5.0 L/min

        # Add slight natural measurement noise
        self.flow_rate += (target_flow - self.flow_rate) * 0.4 + random.uniform(-0.15, 0.15)
        self.flow_rate = max(0.0, self.flow_rate)

        self.pressure += (target_pressure - self.pressure) * 0.4 + random.uniform(-0.01, 0.01)
        self.pressure = max(0.0, self.pressure)

        # 2. Temperature Dynamics
        if self.inject_high_temp:
            self.temperature += 2.0 * dt
        else:
            if self.heater_active and not self.emergency_stop:
                # Heating rate depending on power and water flow
                heat_power_factor = (self.heater_power / 100.0) * 1.8
                # Slower rise if high flow, faster if low flow
                flow_factor = 1.0 if self.flow_rate < 5 else 30.0 / (self.flow_rate + 10.0)
                self.temperature += heat_power_factor * flow_factor * dt * 0.3
            else:
                # Natural cooling towards ambient
                cooling_rate = 0.05 * dt
                self.temperature += (self.ambient_temp - self.temperature) * cooling_rate

        self.temperature += random.uniform(-0.05, 0.05)

    async def run(self):
        print(f"🌊 [Simulator] Starting Smart Water Circulation Simulator...")
        print(f"📡 [Simulator] Connecting to TCP Server at {self.host}:{self.port}...")

        while True:
            try:
                reader, writer = await asyncio.open_connection(self.host, self.port)
                print("✅ [Simulator] Connected to Backend TCP Server!")

                while True:
                    start_time = time.time()
                    self.step_physics(self.interval)

                    # Prepare telemetry packet
                    payload = {
                        "device_id": "STATION_SMART_01",
                        "temperature": round(self.temperature, 2),
                        "pressure": round(self.pressure, 3),
                        "flow_rate": round(self.flow_rate, 2),
                    }
                    data_str = json.dumps(payload) + "\n"
                    writer.write(data_str.encode("utf-8"))
                    await writer.drain()

                    print(
                        f"📤 Telemetry Sent -> Temp: {payload['temperature']:5.1f}°C | "
                        f"Press: {payload['pressure']:5.2f}MPa | "
                        f"Flow: {payload['flow_rate']:5.1f}L/min | "
                        f"Actuators: [Pump: {'ON' if self.pump_active else 'OFF'} ({self.pump_speed}%), "
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
    parser = argparse.ArgumentParser(description="Water Circulation TCP Client Simulator")
    parser.add_argument("--host", default="127.0.0.1", help="TCP server host")
    parser.add_argument("--port", type=int, default=8888, help="TCP server port")
    parser.add_argument("--interval", type=float, default=1.0, help="Reporting interval in seconds")
    args = parser.parse_args()

    sim = WaterCirculationSimulator(host=args.host, port=args.port, interval=args.interval)
    try:
        asyncio.run(sim.run())
    except KeyboardInterrupt:
        print("\n🛑 [Simulator] Stopped.")


if __name__ == "__main__":
    main()
