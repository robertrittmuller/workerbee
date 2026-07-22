"""User-level WorkerBee API entry point for the desktop sidecar."""

import os

import uvicorn
from app.main import app as workerbee_app


def main() -> None:
    """Run the local API on the loopback interface only."""
    port = int(os.environ.get("WORKERBEE_BACKEND_PORT", "8765"))
    uvicorn.run(
        workerbee_app,
        host="127.0.0.1",
        port=port,
        log_level=os.environ.get("WORKERBEE_LOG_LEVEL", "warning"),
        access_log=False,
    )


if __name__ == "__main__":
    main()
