import json
import httpx
from typing import Any, AsyncGenerator

from app.config import settings

class OpenCodeClient:
    def __init__(self):
        self.base_url = settings.opencode_api_base_url
        self.auth = ("opencode", settings.opencode_password)
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            auth=self.auth,
            timeout=120.0
        )

    async def create_session(self, title: str = "WorkerBee Execution") -> dict[str, Any]:
        """Create a new session in OpenCode."""
        resp = await self.client.post("/session", json={"title": title})
        resp.raise_for_status()
        return resp.json()

    async def get_session(self, session_id: str) -> dict[str, Any]:
        resp = await self.client.get(f"/session/{session_id}")
        resp.raise_for_status()
        return resp.json()

    async def abort_session(self, session_id: str) -> bool:
        resp = await self.client.post(f"/session/{session_id}/abort")
        if resp.status_code == 404: # Doesn't exist or already done
            return True
        resp.raise_for_status()
        return True

    async def delete_session(self, session_id: str) -> bool:
        resp = await self.client.delete(f"/session/{session_id}")
        resp.raise_for_status()
        return True

    async def send_prompt(self, session_id: str, prompt: str, agent_name: str = "build", model: str | None = None) -> dict[str, Any]:
        """Send a synchronous prompt to the session, wait for result."""
        payload = {
            "agent": agent_name,
            "parts": [{"type": "text", "text": prompt}]
        }
        # model parameter removed because OpenCode expects an object if provided, which breaks the API.
            
        resp = await self.client.post(f"/session/{session_id}/message", json=payload, timeout=settings.execution_timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"OpenCode API error {resp.status_code}: {resp.text}")
        
        try:
            return resp.json()
        except json.JSONDecodeError:
            return {"raw_text": resp.text, "messages": [{"role": "assistant", "content": resp.text}]}

    async def close(self):
        await self.client.aclose()

opencode_client = OpenCodeClient()
