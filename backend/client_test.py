import json
import socket
import sys


def main():
    host = "127.0.0.1"
    port = 8888

    if len(sys.argv) > 1:
        message = sys.argv[1]
    else:
        # Default dual-tank telemetry payload
        message = json.dumps({
            "device_id": "DUAL_TANK_TEST_01",
            "temp_tank1": 46.5,
            "temp_tank2": 42.0,
            "pressure": 0.35,
            "flow_rate": 18.5,
            "water_level_tank1": 80.0,
            "water_level_tank2": 65.0,
        })

    if not message.endswith("\n"):
        message += "\n"

    print(f"Connecting to TCP server at {host}:{port}...")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((host, port))
        print(f"Connected! Sending: {message.strip()}")
        s.sendall(message.encode("utf-8"))

        response = s.recv(1024).decode("utf-8")
        print(f"Received from server: {response.strip()}")

    print("Closing connection...")
    print("Connection closed.")


if __name__ == "__main__":
    main()
