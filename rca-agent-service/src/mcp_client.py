from __future__ import annotations

import itertools
from typing import Any

import httpx


class MCPClient:
    def __init__(self, url: str, token: str, timeout: float = 30.0):
        self.url = url
        self.timeout = timeout
        self._ids = itertools.count(1)
        self._client = httpx.AsyncClient(
            timeout=timeout, headers={"Authorization": f"Bearer {token}"}
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def initialize(self) -> dict[str, Any]:
        return await self._request("initialize")

    async def list_tools(self) -> list[dict[str, Any]]:
        result = await self._request("tools/list")
        return result.get("tools", [])

    async def validate_required_tools(self, required: set[str]) -> None:
        tools = await self.list_tools()
        names = {tool.get("name") for tool in tools}
        missing = sorted(required - names)
        forbidden = "extract_evidence" in names
        if missing:
            raise RuntimeError(f"MCP server is missing required tools: {missing}")
        if forbidden:
            raise RuntimeError("MCP server still exposes forbidden tool extract_evidence")

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        result = await self._request(
            "tools/call",
            {
                "name": name,
                "arguments": arguments,
            },
        )
        if "structuredContent" in result:
            return result["structuredContent"]
        content = result.get("content") or []
        return content[0].get("text") if content else result

    async def _request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": next(self._ids),
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        response = await self._client.post(self.url, json=payload)
        response.raise_for_status()
        body = response.json()
        if body.get("error"):
            raise RuntimeError(body["error"].get("message", "MCP request failed"))
        return body.get("result")
