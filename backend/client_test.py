import asyncio
import sys


async def tcp_client(message: str = "Hello from TCP Client!"):
    host = "127.0.0.1"
    port = 8888

    print(f"Connecting to TCP server at {host}:{port}...")
    try:
        reader, writer = await asyncio.open_connection(host, port)
        print(f"Connected! Sending: {message}")
        writer.write(f"{message}\n".encode("utf-8"))
        await writer.drain()

        data = await reader.read(4096)
        print(f"Received from server: {data.decode('utf-8').strip()}")

        print("Closing connection...")
        writer.close()
        await writer.wait_closed()
        print("Connection closed.")
    except ConnectionRefusedError:
        print(f"Failed to connect: Server not running at {host}:{port}")


if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Hello from TCP Client!"
    asyncio.run(tcp_client(msg))
