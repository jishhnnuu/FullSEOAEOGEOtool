"""Google Gemini (generativelanguage) adapter."""

from __future__ import annotations

from typing import Any

import httpx

from seoos.core.errors import ProviderError, RateLimited
from seoos.llm.base import Completion, LLMProvider, LLMRequest, ToolUse, Usage
from seoos.llm.pricing import estimate_cost


class GoogleProvider(LLMProvider):
    name = "google"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, **kwargs):
        super().__init__(
            api_key=api_key,
            base_url=base_url or "https://generativelanguage.googleapis.com/v1beta",
            **kwargs,
        )
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.options.get("timeout", 300.0)),
                headers={"content-type": "application/json"},
            )
        return self._client

    def _contents(self, request: LLMRequest) -> list[dict[str, Any]]:
        contents: list[dict[str, Any]] = []
        for msg in request.messages:
            if msg.role == "system":
                continue
            if msg.role == "tool":
                parts = [
                    {
                        "functionResponse": {
                            "name": r.name,
                            "response": {"result": r.content, "error": r.is_error},
                        }
                    }
                    for r in msg.tool_results
                ]
                contents.append({"role": "user", "parts": parts})
                continue
            parts: list[dict[str, Any]] = []
            if msg.content:
                parts.append({"text": msg.content})
            for use in msg.tool_uses:
                parts.append({"functionCall": {"name": use.name, "args": use.arguments}})
            if parts:
                contents.append(
                    {"role": "model" if msg.role == "assistant" else "user", "parts": parts}
                )
        return contents

    async def complete(self, request: LLMRequest) -> Completion:
        if not self.api_key:
            raise ProviderError("No Google API key configured for this tenant")
        model = request.model or "gemini-2.5-flash"
        payload: dict[str, Any] = {
            "contents": self._contents(request),
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
            },
        }
        if request.system:
            payload["systemInstruction"] = {"parts": [{"text": request.system}]}
        if request.stop_sequences:
            payload["generationConfig"]["stopSequences"] = request.stop_sequences
        if request.response_format == "json":
            payload["generationConfig"]["responseMimeType"] = "application/json"
        if request.tools:
            payload["tools"] = [
                {"functionDeclarations": [t.to_google() for t in request.tools]}
            ]
            if request.tool_choice == "any":
                payload["toolConfig"] = {"functionCallingConfig": {"mode": "ANY"}}

        try:
            resp = await self._http().post(
                f"/models/{model}:generateContent",
                json=payload,
                params={"key": self.api_key},
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Google request failed: {exc}") from exc

        if resp.status_code == 429:
            raise RateLimited("Google rate limit")
        if resp.status_code >= 400:
            raise ProviderError(f"Google returned {resp.status_code}: {resp.text[:600]}")

        data = resp.json()
        candidates = data.get("candidates") or [{}]
        parts = ((candidates[0].get("content") or {}).get("parts")) or []
        text_parts, tool_uses = [], []
        for idx, part in enumerate(parts):
            if "text" in part:
                text_parts.append(part["text"])
            elif "functionCall" in part:
                call = part["functionCall"]
                tool_uses.append(
                    ToolUse(
                        id=f"{call.get('name','fn')}_{idx}",
                        name=call.get("name", ""),
                        arguments=call.get("args") or {},
                    )
                )

        meta = data.get("usageMetadata", {}) or {}
        tokens_in = int(meta.get("promptTokenCount", 0) or 0)
        tokens_out = int(meta.get("candidatesTokenCount", 0) or 0)
        cached = int(meta.get("cachedContentTokenCount", 0) or 0)
        return Completion(
            text="\n".join(text_parts),
            tool_uses=tool_uses,
            stop_reason=candidates[0].get("finishReason", "STOP"),
            usage=Usage(tokens_in, tokens_out, cached, estimate_cost(model, tokens_in, tokens_out, cached)),
            provider=self.name,
            model=model,
            raw=data,
        )

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        model = model or "gemini-embedding-001"
        out = []
        for text in texts:
            resp = await self._http().post(
                f"/models/{model}:embedContent",
                json={"content": {"parts": [{"text": text}]}},
                params={"key": self.api_key},
            )
            if resp.status_code >= 400:
                raise ProviderError(f"Google embeddings returned {resp.status_code}")
            out.append(resp.json()["embedding"]["values"])
        return out

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
