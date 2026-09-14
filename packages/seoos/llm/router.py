"""The model gateway.

Everything generative in the platform goes through :class:`ModelRouter`. It
owns four responsibilities that must not be scattered:

1. **Whose key.** A tenant's own provider credentials take precedence over
   the platform's. A client on a data-residency requirement can route their
   entire workload to their own endpoint and nothing about their content
   touches a shared account.
2. **Which model for which job.** Agents declare a *tier* ("fast", "standard",
   "deep"), never a model id, so the deployment can swap models without
   touching fifty agent definitions.
3. **Fallback.** Provider down, rate limited, or model unavailable falls
   through an ordered chain, and finally to the echo provider so the platform
   degrades loudly instead of crashing.
4. **Spend.** Every completion is priced and recorded, and a call that would
   breach the run or org ceiling is refused before it is made.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from seoos.core.config import get_settings
from seoos.core.errors import BudgetExceeded, ProviderError, RateLimited
from seoos.core.logging import get_logger
from seoos.llm.base import Completion, LLMProvider, LLMRequest, Message, ToolSpec
from seoos.llm.pricing import approx_tokens
from seoos.llm.providers import (
    AnthropicProvider,
    AzureOpenAIProvider,
    EchoProvider,
    GoogleProvider,
    OllamaProvider,
    OpenAIProvider,
    OpenRouterProvider,
)

log = get_logger("seoos.llm.router")

PROVIDER_CLASSES: dict[str, type[LLMProvider]] = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "google": GoogleProvider,
    "openrouter": OpenRouterProvider,
    "azure": AzureOpenAIProvider,
    "ollama": OllamaProvider,
    "echo": EchoProvider,
}

# Tier -> per-provider model. Agents ask for a tier; this table resolves it.
TIER_MODELS: dict[str, dict[str, str]] = {
    "fast": {
        "anthropic": "claude-haiku-4-5-20251001",
        "openai": "gpt-5-mini",
        "google": "gemini-2.5-flash",
        "openrouter": "anthropic/claude-haiku-4.5",
        "azure": "gpt-4o-mini",
        "ollama": "llama3.1:8b",
    },
    "standard": {
        "anthropic": "claude-sonnet-5",
        "openai": "gpt-5",
        "google": "gemini-2.5-pro",
        "openrouter": "anthropic/claude-sonnet-5",
        "azure": "gpt-4o",
        "ollama": "llama3.3:70b",
    },
    "deep": {
        "anthropic": "claude-opus-5",
        "openai": "gpt-5",
        "google": "gemini-2.5-pro",
        "openrouter": "anthropic/claude-opus-5",
        "azure": "gpt-4o",
        "ollama": "llama3.3:70b",
    },
}


@dataclass
class ProviderCredential:
    """A tenant-supplied or platform-supplied way to reach a provider."""

    provider: str
    api_key: str | None = None
    base_url: str | None = None
    options: dict[str, Any] = field(default_factory=dict)
    source: str = "platform"  # platform | tenant


@dataclass
class SpendGuard:
    """Hard ceilings. Checked before a call, updated after it."""

    run_limit_usd: float
    org_remaining_usd: float
    spent_usd: float = 0.0

    def check(self, projected_usd: float) -> None:
        if self.spent_usd + projected_usd > self.run_limit_usd:
            raise BudgetExceeded(
                f"Run budget of ${self.run_limit_usd:.2f} would be exceeded "
                f"(spent ${self.spent_usd:.4f}, next call ~${projected_usd:.4f})"
            )
        if projected_usd > self.org_remaining_usd:
            raise BudgetExceeded(
                f"Organisation budget exhausted (${self.org_remaining_usd:.2f} remaining)"
            )

    def record(self, usd: float) -> None:
        self.spent_usd += usd
        self.org_remaining_usd -= usd


class ModelRouter:
    def __init__(
        self,
        credentials: list[ProviderCredential] | None = None,
        *,
        preferred: str | None = None,
        spend_guard: SpendGuard | None = None,
        on_usage=None,
    ):
        settings = get_settings()
        self.settings = settings
        self.credentials = credentials or self._platform_credentials()
        self.preferred = preferred or settings.default_llm_provider
        self.spend_guard = spend_guard
        self.on_usage = on_usage
        self._instances: dict[str, LLMProvider] = {}
        self._cooldowns: dict[str, float] = {}

    # -- credential discovery ----------------------------------------------

    @staticmethod
    def _platform_credentials() -> list[ProviderCredential]:
        s = get_settings()
        creds: list[ProviderCredential] = []
        if s.anthropic_api_key:
            creds.append(ProviderCredential("anthropic", s.anthropic_api_key))
        if s.openai_api_key:
            creds.append(ProviderCredential("openai", s.openai_api_key))
        if s.google_api_key:
            creds.append(ProviderCredential("google", s.google_api_key))
        if s.openrouter_api_key:
            creds.append(ProviderCredential("openrouter", s.openrouter_api_key))
        if s.azure_openai_api_key and s.azure_openai_endpoint:
            creds.append(
                ProviderCredential("azure", s.azure_openai_api_key, s.azure_openai_endpoint)
            )
        if s.ollama_base_url:
            creds.append(ProviderCredential("ollama", None, s.ollama_base_url))
        return creds

    @classmethod
    def for_tenant(
        cls,
        tenant_credentials: list[ProviderCredential],
        *,
        preferred: str | None = None,
        spend_guard: SpendGuard | None = None,
        on_usage=None,
    ) -> ModelRouter:
        """Tenant keys first, platform keys as the fallback tail."""
        merged = list(tenant_credentials) + [
            c for c in cls._platform_credentials()
            if c.provider not in {t.provider for t in tenant_credentials}
        ]
        return cls(merged, preferred=preferred, spend_guard=spend_guard, on_usage=on_usage)

    # -- provider handling --------------------------------------------------

    def available_providers(self) -> list[str]:
        """Ordered: preferred first, then the rest, cooled-down ones last."""
        names = [c.provider for c in self.credentials]
        if self.preferred in names:
            names.remove(self.preferred)
            names.insert(0, self.preferred)
        now = time.monotonic()
        live = [n for n in names if self._cooldowns.get(n, 0) < now]
        cooling = [n for n in names if self._cooldowns.get(n, 0) >= now]
        return live + cooling

    def _instance(self, provider: str) -> LLMProvider:
        if provider not in self._instances:
            cred = next((c for c in self.credentials if c.provider == provider), None)
            klass = PROVIDER_CLASSES.get(provider, EchoProvider)
            if cred is None:
                self._instances[provider] = EchoProvider()
            else:
                self._instances[provider] = klass(
                    api_key=cred.api_key,
                    base_url=cred.base_url,
                    timeout=self.settings.llm_timeout_seconds,
                    **cred.options,
                )
        return self._instances[provider]

    def resolve_model(self, provider: str, tier: str, override: str | None = None) -> str:
        if override:
            return override
        return TIER_MODELS.get(tier, TIER_MODELS["standard"]).get(
            provider, self.settings.default_llm_model
        )

    # -- the call -----------------------------------------------------------

    async def complete(
        self,
        messages: list[Message],
        *,
        system: str | None = None,
        tier: str = "standard",
        model: str | None = None,
        tools: list[ToolSpec] | None = None,
        tool_choice: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.4,
        response_format: str | None = None,
        stop_sequences: list[str] | None = None,
        extra: dict | None = None,
        max_attempts: int = 3,
    ) -> Completion:
        providers = self.available_providers()
        if not providers:
            providers = ["echo"]

        projected = self._project_cost(messages, system, max_tokens, providers[0], tier, model)
        if self.spend_guard:
            self.spend_guard.check(projected)

        last_error: Exception | None = None
        for provider in providers:
            instance = self._instance(provider)
            if tools and not instance.supports_tools:
                continue
            resolved_model = self.resolve_model(provider, tier, model)
            request = LLMRequest(
                messages=messages,
                system=system,
                model=resolved_model,
                tools=tools or [],
                tool_choice=tool_choice,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format=response_format,
                stop_sequences=stop_sequences or [],
                extra=extra or {},
            )
            for attempt in range(max_attempts):
                try:
                    completion = await instance.complete(request)
                    if self.spend_guard:
                        self.spend_guard.record(completion.usage.usd)
                    if self.on_usage:
                        maybe = self.on_usage(completion)
                        if asyncio.iscoroutine(maybe):
                            await maybe
                    return completion
                except RateLimited as exc:
                    last_error = exc
                    # Back off this provider, then move on rather than
                    # hammering a limit that is not going to clear in 4s.
                    self._cooldowns[provider] = time.monotonic() + 60
                    await asyncio.sleep(min(2**attempt, 8))
                    break
                except ProviderError as exc:
                    last_error = exc
                    if attempt == max_attempts - 1:
                        log.warning(
                            "provider %s failed after %d attempts: %s",
                            provider, max_attempts, exc,
                        )
                        self._cooldowns[provider] = time.monotonic() + 30
                        break
                    await asyncio.sleep(min(2**attempt, 8))
                except BudgetExceeded:
                    raise

        # Nothing worked. Degrade rather than fail the whole mission: the
        # caller decides whether a degraded answer is acceptable for this step.
        log.error("all model providers failed; degrading to echo: %s", last_error)
        echo = EchoProvider()
        completion = await echo.complete(
            LLMRequest(messages=messages, system=system, model="echo", max_tokens=max_tokens)
        )
        completion.stop_reason = "degraded"
        return completion

    def _project_cost(
        self, messages, system, max_tokens: int, provider: str, tier: str, model: str | None
    ) -> float:
        from seoos.llm.pricing import estimate_cost

        text = (system or "") + "".join(m.content or "" for m in messages)
        return estimate_cost(self.resolve_model(provider, tier, model), approx_tokens(text), max_tokens)

    async def embed(self, texts: list[str], *, model: str | None = None) -> list[list[float]]:
        from seoos.llm.embeddings import hashing_embed

        for provider in self.available_providers():
            instance = self._instance(provider)
            try:
                return await instance.embed(texts, model=model)
            except (NotImplementedError, ProviderError):
                continue
        return [hashing_embed(t) for t in texts]

    async def close(self) -> None:
        for instance in self._instances.values():
            await instance.close()
        self._instances.clear()
