"""Provider-neutral model interface.

The platform must never be tied to one model vendor. Concretely that means:

* Nothing above this module knows what an "Anthropic message" looks like.
* Tool schemas are written once in JSON Schema and translated per provider.
* A deployment with no API keys at all still boots and runs every
  deterministic analyser; only generative steps degrade, and they say so.

The interface is deliberately small. Anything a provider offers that is not
expressible here (extended thinking budgets, provider-specific caching hints)
goes in ``extra`` and is ignored by providers that do not understand it.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

Role = Literal["system", "user", "assistant", "tool"]


@dataclass
class ToolSpec:
    """One capability offered to the model, described in JSON Schema."""

    name: str
    description: str
    parameters: dict[str, Any]

    def to_openai(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def to_anthropic(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }

    def to_google(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": _strip_unsupported_schema(self.parameters),
        }


def _strip_unsupported_schema(schema: dict) -> dict:
    """Gemini's function declarations reject several JSON Schema keywords."""
    unsupported = {
        "$schema", "additionalProperties", "examples", "default",
        "exclusiveMinimum", "exclusiveMaximum", "const", "$ref", "$defs",
        "oneOf", "anyOf", "allOf", "patternProperties", "minLength", "maxLength",
    }
    if not isinstance(schema, dict):
        return schema
    out = {}
    for key, value in schema.items():
        if key in unsupported:
            continue
        if key == "properties" and isinstance(value, dict):
            out[key] = {k: _strip_unsupported_schema(v) for k, v in value.items()}
        elif key == "items":
            out[key] = _strip_unsupported_schema(value)
        else:
            out[key] = value
    return out


@dataclass
class ToolUse:
    """The model asked to run a tool."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    """What the runtime handed back."""

    tool_use_id: str
    name: str
    content: str
    is_error: bool = False


@dataclass
class Message:
    role: Role
    content: str | None = None
    tool_uses: list[ToolUse] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    # Marks a prefix boundary worth caching where the provider supports it.
    cache_marker: bool = False

    @classmethod
    def user(cls, text: str) -> Message:
        return cls(role="user", content=text)

    @classmethod
    def assistant(cls, text: str | None = None, tool_uses: list[ToolUse] | None = None) -> Message:
        return cls(role="assistant", content=text, tool_uses=tool_uses or [])

    @classmethod
    def tool(cls, results: list[ToolResult]) -> Message:
        return cls(role="tool", tool_results=results)


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_input_tokens: int = 0
    usd: float = 0.0

    def __add__(self, other: Usage) -> Usage:
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cached_input_tokens=self.cached_input_tokens + other.cached_input_tokens,
            usd=self.usd + other.usd,
        )


@dataclass
class Completion:
    text: str
    tool_uses: list[ToolUse] = field(default_factory=list)
    stop_reason: str = "end_turn"
    usage: Usage = field(default_factory=Usage)
    provider: str = ""
    model: str = ""
    raw: dict[str, Any] | None = None

    @property
    def wants_tools(self) -> bool:
        return bool(self.tool_uses)

    def json(self) -> Any:
        """Parse the completion as JSON, tolerating fenced code blocks.

        Models wrap JSON in ``` fences often enough that failing on it would
        cost real reliability for no benefit.
        """
        text = (self.text or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = min(
                (i for i in (text.find("{"), text.find("[")) if i != -1),
                default=-1,
            )
            if start == -1:
                raise
            end = max(text.rfind("}"), text.rfind("]"))
            if end <= start:
                raise
            return json.loads(text[start : end + 1])


@dataclass
class LLMRequest:
    messages: list[Message]
    system: str | None = None
    model: str | None = None
    tools: list[ToolSpec] = field(default_factory=list)
    tool_choice: str | None = None  # None | "auto" | "any" | "<tool name>"
    max_tokens: int = 4096
    temperature: float = 0.4
    stop_sequences: list[str] = field(default_factory=list)
    response_format: str | None = None  # None | "json"
    extra: dict[str, Any] = field(default_factory=dict)


class LLMProvider(ABC):
    """Every provider adapter implements exactly this."""

    name: str = "unknown"
    supports_tools: bool = True
    supports_system: bool = True

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, **kwargs):
        self.api_key = api_key
        self.base_url = base_url
        self.options = kwargs

    @abstractmethod
    async def complete(self, request: LLMRequest) -> Completion:
        """One turn. Tool execution is the caller's job, never the provider's."""

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        raise NotImplementedError(f"{self.name} does not offer embeddings")

    async def close(self) -> None:  # pragma: no cover - most providers are stateless
        return None
