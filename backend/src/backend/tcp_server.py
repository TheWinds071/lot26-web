import asyncio
import logging
from typing import Optional

logger = logging.getLogger("tcp_server")
logging.basicConfig(level=logging.INFO)


class TCPServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8888):
        self.host = host
        self.port = port
        self.server: Optional[asyncio.Server] = None
        self._serve_task: Optional[asyncio.Task] = None

    async def handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        client_address = writer.get_extra_info("peername")
        logger.info(f"[TCP Server] Client connected from: {client_address}")

        try:
            while True:
                data = await reader.read(4096)
                if not data:
                    logger.info(
                        f"[TCP Server] Client {client_address} disconnected."
                    )
                    break

                message = data.decode("utf-8", errors="replace")
                logger.info(
                    f"[TCP Server] Received from {client_address}: {message.strip()}"
                )

                # Optional echo / response back to TCP client
                response = f"ACK: Received {len(data)} bytes\n"
                writer.write(response.encode("utf-8"))
                await writer.drain()
        except asyncio.CancelledError:
            logger.info(
                f"[TCP Server] Connection handler for {client_address} cancelled."
            )
        except Exception as e:
            logger.error(
                f"[TCP Server] Error handling client {client_address}: {e}"
            )
        finally:
            writer.close()
            await writer.wait_closed()

    async def start(self) -> None:
        self.server = await asyncio.start_server(
            self.handle_client, self.host, self.port
        )
        addrs = ", ".join(
            str(sock.getsockname()) for sock in self.server.sockets
        )
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
