"""Anthropic Messages API adapter.

Talks HTTP directly rather than through the vendor SDK. That keeps the
dependency surface small and, more importantly, means the platform has no
runtime relationship with any particular Claude product or session: it is a
customer of an HTTP endpoint using a key the deployment owns.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from seoos.core.errors import ProviderError, RateLimited
from seoos.llm.base import Completion, LLMProvider, LLMRequest, Message, ToolUse, Usage
from seoos.llm.pricing import estimate_cost

API_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, **kwargs):
        super().__init__(api_key=api_key, base_url=base_url or "https://api.anthropic.com", **kwargs)
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.options.get("timeout", 300.0)),
                headers={
                    "x-api-key": self.api_key or "",
                    "anthropic-version": API_VERSION,
                    "content-type": "application/json",
                },
            )
        return self._client

    # -- message translation ------------------------------------------------

    def _blocks(self, msg: Message) -> list[dict[str, Any]]:
        blocks: list[dict[str, Any]] = []
        if msg.role == "tool":
            for result in msg.tool_results:
                blocks.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": result.tool_use_id,
                        "content": result.content,
                        "is_error": result.is_error,
                    }
                )
            return blocks
        if msg.content:
            blocks.append({"type": "text", "text": msg.content})
        for use in msg.tool_uses:
            blocks.append(
                {"type": "tool_use", "id": use.id, "name": use.name, "input": use.arguments}
            )
        return blocks

    def _payload(self, request: LLMRequest) -> dict[str, Any]:
        messages: list[dict[str, Any]] = []
        for msg in request.messages:
            if msg.role == "system":
                continue
            role = "user" if msg.role in ("user", "tool") else "assistant"
            blocks = self._blocks(msg)
            if not blocks:
                continue
            if messages and messages[-1]["role"] == role:
                messages[-1]["content"].extend(blocks)
            else:
                messages.append({"role": role, "content": blocks})

        payload: dict[str, Any] = {
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }
        if request.system:
            # Cache the system prompt: agent system prompts are long, stable,
            # and re-sent on every tool-loop iteration.
            payload["system"] = [
                {
                    "type": "text",
                    "text": request.system,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        if request.stop_sequences:
            payload["stop_sequences"] = request.stop_sequences
        if request.tools:
            payload["tools"] = [t.to_anthropic() for t in request.tools]
            if request.tool_choice == "any":
                payload["tool_choice"] = {"type": "any"}
            elif request.tool_choice and request.tool_choice != "auto":
                payload["tool_choice"] = {"type": "tool", "name": request.tool_choice}
            else:
                payload["tool_choice"] = {"type": "auto"}
        payload.update(request.extra.get("anthropic", {}))
        return payload

    # -- execution ----------------------------------------------------------

    async def complete(self, request: LLMRequest) -> Completion:
        if not self.api_key:
            raise ProviderError("No Anthropic API key configured for this tenant")
        payload = self._payload(request)
        try:
            resp = await self._http().post("/v1/messages", json=payload)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Anthropic request failed: {exc}") from exc

        if resp.status_code == 429:
            raise RateLimited("Anthropic rate limit", context={"retry_after": resp.headers.get("retry-after")})
        if resp.status_code >= 400:
            raise ProviderError(
                f"Anthropic returned {resp.status_code}: {resp.text[:600]}",
                context={"status": resp.status_code},
            )

        data = resp.json()
        text_parts: list[str] = []
        tool_uses: list[ToolUse] = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block.get("text", ""))
            elif block.get("type") == "tool_use":
                tool_uses.append(
                    ToolUse(
                        id=block.get("id", ""),
                        name=block.get("name", ""),
                        arguments=block.get("input") or {},
                    )
                )

        raw_usage = data.get("usage", {}) or {}
        cached = int(raw_usage.get("cache_read_input_tokens", 0) or 0)
        tokens_in = int(raw_usage.get("input_tokens", 0) or 0) + cached
        tokens_out = int(raw_usage.get("output_tokens", 0) or 0)
        model = data.get("model", request.model or "")
        usage = Usage(
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            cached_input_tokens=cached,
            usd=estimate_cost(model, tokens_in, tokens_out, cached),
        )
        return Completion(
            text="\n".join(p for p in text_parts if p),
            tool_uses=tool_uses,
            stop_reason=data.get("stop_reason", "end_turn"),
            usage=usage,
            provider=self.name,
            model=model,
            raw=data,
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def parse_arguments(blob: str | dict) -> dict:
    if isinstance(blob, dict):
        return blob
    try:
        return json.loads(blob or "{}")
    except json.JSONDecodeError:
        return {}
