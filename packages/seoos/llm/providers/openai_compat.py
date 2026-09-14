"""OpenAI Chat Completions adapter, plus the family that speaks the same wire
format: OpenRouter, Azure OpenAI, Together, Groq, vLLM and Ollama.

One adapter covers all of them because the only differences are the base URL,
the auth header and a couple of headers. That is a large part of why the
platform can be repointed at a different vendor by changing configuration.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from seoos.core.errors import ProviderError, RateLimited
from seoos.llm.base import Completion, LLMProvider, LLMRequest, ToolUse, Usage
from seoos.llm.pricing import estimate_cost, estimate_embedding_cost


class OpenAICompatibleProvider(LLMProvider):
    name = "openai_compatible"
    default_base_url = "https://api.openai.com/v1"
    auth_scheme = "Bearer"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, **kwargs):
        super().__init__(api_key=api_key, base_url=base_url or self.default_base_url, **kwargs)
        self._client: httpx.AsyncClient | None = None

    def extra_headers(self) -> dict[str, str]:
        return {}

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            headers = {"content-type": "application/json", **self.extra_headers()}
            if self.api_key:
                headers["Authorization"] = f"{self.auth_scheme} {self.api_key}"
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.options.get("timeout", 300.0)),
                headers=headers,
            )
        return self._client

    # -- message translation ------------------------------------------------

    def _messages(self, request: LLMRequest) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if request.system:
            out.append({"role": "system", "content": request.system})
        for msg in request.messages:
            if msg.role == "system":
                out.append({"role": "system", "content": msg.content or ""})
            elif msg.role == "tool":
                for result in msg.tool_results:
                    out.append(
                        {
                            "role": "tool",
                            "tool_call_id": result.tool_use_id,
                            "content": result.content,
                        }
                    )
            elif msg.role == "assistant":
                entry: dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
                if msg.tool_uses:
                    entry["tool_calls"] = [
                        {
                            "id": u.id,
                            "type": "function",
                            "function": {
                                "name": u.name,
                                "arguments": json.dumps(u.arguments),
                            },
                        }
                        for u in msg.tool_uses
                    ]
                    if not entry["content"]:
                        entry["content"] = None
                out.append(entry)
            else:
                out.append({"role": "user", "content": msg.content or ""})
        return out

    def _payload(self, request: LLMRequest) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": request.model,
            "messages": self._messages(request),
            "max_completion_tokens": request.max_tokens,
            "temperature": request.temperature,
        }
        if request.stop_sequences:
            payload["stop"] = request.stop_sequences
        if request.response_format == "json":
            payload["response_format"] = {"type": "json_object"}
        if request.tools:
            payload["tools"] = [t.to_openai() for t in request.tools]
            if request.tool_choice == "any":
                payload["tool_choice"] = "required"
            elif request.tool_choice and request.tool_choice != "auto":
                payload["tool_choice"] = {
                    "type": "function",
                    "function": {"name": request.tool_choice},
                }
            else:
                payload["tool_choice"] = "auto"
        payload.update(request.extra.get("openai", {}))
        return payload

    def _endpoint(self) -> str:
        return "/chat/completions"

    async def complete(self, request: LLMRequest) -> Completion:
        if not self.api_key and self.name not in ("ollama",):
            raise ProviderError(f"No {self.name} API key configured for this tenant")
        payload = self._payload(request)
        try:
            resp = await self._http().post(self._endpoint(), json=payload)
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self.name} request failed: {exc}") from exc

        if resp.status_code == 429:
            raise RateLimited(f"{self.name} rate limit")
        if resp.status_code >= 400:
            # Some gateways reject max_completion_tokens; retry the older name
            # once rather than failing a whole agent run over a field name.
            if resp.status_code == 400 and "max_completion_tokens" in resp.text:
                payload["max_tokens"] = payload.pop("max_completion_tokens")
                resp = await self._http().post(self._endpoint(), json=payload)
            if resp.status_code >= 400:
                raise ProviderError(
                    f"{self.name} returned {resp.status_code}: {resp.text[:600]}",
                    context={"status": resp.status_code},
                )

        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message", {}) or {}
        tool_uses = [
            ToolUse(
                id=call.get("id", ""),
                name=(call.get("function") or {}).get("name", ""),
                arguments=_safe_json((call.get("function") or {}).get("arguments")),
            )
            for call in (message.get("tool_calls") or [])
        ]

        raw_usage = data.get("usage", {}) or {}
        cached = int(
            (raw_usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0) or 0
        )
        tokens_in = int(raw_usage.get("prompt_tokens", 0) or 0)
        tokens_out = int(raw_usage.get("completion_tokens", 0) or 0)
        model = data.get("model", request.model or "")
        return Completion(
            text=message.get("content") or "",
            tool_uses=tool_uses,
            stop_reason=choice.get("finish_reason", "stop"),
            usage=Usage(
                input_tokens=tokens_in,
                output_tokens=tokens_out,
                cached_input_tokens=cached,
                usd=estimate_cost(model, tokens_in, tokens_out, cached),
            ),
            provider=self.name,
            model=model,
            raw=data,
        )

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        model = model or "text-embedding-3-small"
        resp = await self._http().post("/embeddings", json={"model": model, "input": texts})
        if resp.status_code >= 400:
            raise ProviderError(f"{self.name} embeddings returned {resp.status_code}")
        data = resp.json()
        tokens = int((data.get("usage") or {}).get("total_tokens", 0) or 0)
        estimate_embedding_cost(model, tokens)
        return [row["embedding"] for row in data.get("data", [])]

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def _safe_json(blob: Any) -> dict:
    if isinstance(blob, dict):
        return blob
    try:
        parsed = json.loads(blob or "{}")
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except (json.JSONDecodeError, TypeError):
        return {}


class OpenAIProvider(OpenAICompatibleProvider):
    name = "openai"


class OpenRouterProvider(OpenAICompatibleProvider):
    name = "openrouter"
    default_base_url = "https://openrouter.ai/api/v1"

    def extra_headers(self) -> dict[str, str]:
        return {
            "HTTP-Referer": self.options.get("referer", "https://seo-os.dev"),
            "X-Title": "SEO OS",
        }


class AzureOpenAIProvider(OpenAICompatibleProvider):
    """Azure puts the deployment in the path and the key in its own header."""

    name = "azure"
    auth_scheme = "Bearer"

    def __init__(self, *, api_key=None, base_url=None, deployment: str | None = None, **kwargs):
        super().__init__(api_key=api_key, base_url=base_url, **kwargs)
        self.deployment = deployment
        self.api_version = kwargs.get("api_version", "2024-10-21")

    def extra_headers(self) -> dict[str, str]:
        return {"api-key": self.api_key or ""}

    def _endpoint(self) -> str:
        dep = self.deployment or self.options.get("deployment") or "gpt-4o"
        return f"/openai/deployments/{dep}/chat/completions?api-version={self.api_version}"


class OllamaProvider(OpenAICompatibleProvider):
    """Local inference. Makes the platform runnable with zero external spend
    and zero data leaving the customer's network, which some clients require."""

    name = "ollama"
    default_base_url = "http://localhost:11434/v1"

    def __init__(self, *, api_key=None, base_url=None, **kwargs):
        super().__init__(api_key=api_key or "ollama", base_url=base_url, **kwargs)
