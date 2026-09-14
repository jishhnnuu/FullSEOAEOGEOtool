"""A deterministic provider used when no model access is configured.

This is what makes the platform demonstrable and testable end to end with no
keys and no network. It never pretends to be intelligent: it returns clearly
labelled placeholder output and refuses tool use, so nothing it produces can
be mistaken for a real recommendation or reach a client as finished work.

Content produced under this provider is marked ``degraded`` and the quality
gate in ``seoos.agents.gates`` blocks it from publication.
"""

from __future__ import annotations

import hashlib
import json

from seoos.llm.base import Completion, LLMProvider, LLMRequest, Usage


class EchoProvider(LLMProvider):
    name = "echo"
    supports_tools = False

    async def complete(self, request: LLMRequest) -> Completion:
        last_user = next(
            (m.content for m in reversed(request.messages) if m.role == "user" and m.content),
            "",
        )
        digest = hashlib.sha256((request.system or "" + last_user).encode()).hexdigest()[:8]
        if request.response_format == "json":
            text = json.dumps(
                {
                    "degraded": True,
                    "reason": "no model provider configured",
                    "echo_id": digest,
                    "items": [],
                }
            )
        else:
            text = (
                "[degraded output: no model provider is configured for this "
                f"deployment; request {digest}]\n\n"
                "Configure a provider key (any of Anthropic, OpenAI, Google, "
                "OpenRouter, Azure or a local Ollama endpoint) to enable "
                "generative steps. Deterministic analysis is unaffected."
            )
        return Completion(
            text=text,
            stop_reason="end_turn",
            usage=Usage(
                input_tokens=sum(len(m.content or "") // 4 for m in request.messages),
                output_tokens=len(text) // 4,
                usd=0.0,
            ),
            provider=self.name,
            model="echo",
        )

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        from seoos.llm.embeddings import hashing_embed

        return [hashing_embed(t) for t in texts]
