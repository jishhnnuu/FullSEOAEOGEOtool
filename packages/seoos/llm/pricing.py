"""Model price table, in USD per million tokens.

Prices move. Rather than pretend this is authoritative, the table is a
best-effort default that a deployment overrides with
``SEOOS_PRICING_OVERRIDES`` (a JSON file path) and that every entry falls
back from: an unknown model is charged at the conservative default so a
run can still be budgeted rather than silently costed at zero.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Price:
    input_per_m: float
    output_per_m: float
    cached_input_per_m: float | None = None


# Conservative default for any model not listed. Deliberately not zero:
# a run that cannot be priced must still be budgeted.
DEFAULT_PRICE = Price(input_per_m=3.0, output_per_m=15.0)

PRICES: dict[str, Price] = {
    # Anthropic
    "claude-opus-5": Price(15.0, 75.0, 1.5),
    "claude-sonnet-5": Price(3.0, 15.0, 0.3),
    "claude-fable-5-1": Price(3.0, 15.0, 0.3),
    "claude-haiku-4-5-20251001": Price(1.0, 5.0, 0.1),
    # OpenAI
    "gpt-5": Price(1.25, 10.0, 0.125),
    "gpt-5-mini": Price(0.25, 2.0, 0.025),
    "gpt-4.1": Price(2.0, 8.0, 0.5),
    "gpt-4.1-mini": Price(0.4, 1.6, 0.1),
    "gpt-4o": Price(2.5, 10.0, 1.25),
    "gpt-4o-mini": Price(0.15, 0.6, 0.075),
    "o4-mini": Price(1.1, 4.4, 0.275),
    # Google
    "gemini-2.5-pro": Price(1.25, 10.0, 0.31),
    "gemini-2.5-flash": Price(0.3, 2.5, 0.075),
    "gemini-2.0-flash": Price(0.1, 0.4, 0.025),
    # Open weights, typical hosted rates
    "llama-3.3-70b": Price(0.6, 0.6),
    "qwen-2.5-72b": Price(0.4, 0.4),
    "deepseek-v3": Price(0.27, 1.1),
    "mistral-large": Price(2.0, 6.0),
    # Local inference costs nothing per token.
    "ollama": Price(0.0, 0.0),
}

EMBEDDING_PRICES: dict[str, float] = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
    "voyage-3": 0.06,
    "gemini-embedding-001": 0.15,
    "hashing": 0.0,
}

_overrides_loaded = False


def _load_overrides() -> None:
    global _overrides_loaded
    if _overrides_loaded:
        return
    _overrides_loaded = True
    path = os.environ.get("SEOOS_PRICING_OVERRIDES")
    if not path or not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        for model, entry in data.items():
            PRICES[model] = Price(
                input_per_m=float(entry["input_per_m"]),
                output_per_m=float(entry["output_per_m"]),
                cached_input_per_m=entry.get("cached_input_per_m"),
            )
    except (OSError, ValueError, KeyError, TypeError):
        # A malformed override file must never stop the platform booting.
        pass


def price_for(model: str) -> Price:
    _load_overrides()
    if model in PRICES:
        return PRICES[model]
    # Prefix match handles dated model ids like gpt-5-2026-01-01.
    for known, price in PRICES.items():
        if model.startswith(known):
            return price
    if model.startswith("ollama/") or model.startswith("local/"):
        return Price(0.0, 0.0)
    return DEFAULT_PRICE


def estimate_cost(
    model: str, input_tokens: int, output_tokens: int, cached_input_tokens: int = 0
) -> float:
    p = price_for(model)
    billed_input = max(input_tokens - cached_input_tokens, 0)
    cached_rate = p.cached_input_per_m if p.cached_input_per_m is not None else p.input_per_m
    total = (
        billed_input * p.input_per_m
        + cached_input_tokens * cached_rate
        + output_tokens * p.output_per_m
    ) / 1_000_000
    return round(total, 6)


def estimate_embedding_cost(model: str, tokens: int) -> float:
    rate = EMBEDDING_PRICES.get(model, 0.05)
    return round(tokens * rate / 1_000_000, 6)


def approx_tokens(text: str) -> int:
    """Rough token count used for budgeting before a call is made.

    Four characters per token is close enough for ceiling checks and needs no
    tokenizer dependency for a provider we may not even be using.
    """
    return max(1, len(text) // 4)
