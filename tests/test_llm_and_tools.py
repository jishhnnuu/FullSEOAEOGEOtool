"""The model layer and the tool registry contract."""

from __future__ import annotations

import pytest
from seoos.core.errors import BudgetExceeded
from seoos.llm.base import Completion, Message, ToolSpec
from seoos.llm.embeddings import chunk_text, cosine, hashing_embed
from seoos.llm.pricing import estimate_cost, price_for
from seoos.llm.providers import AnthropicProvider
from seoos.llm.router import ModelRouter, ProviderCredential, SpendGuard
from seoos.tools.registry import (
    Tool,
    ToolExecutor,
    ToolOutcome,
    ToolRegistry,
    autonomy_allows,
)


class TestProviderIndependence:
    def test_tool_schemas_translate_per_provider(self):
        spec = ToolSpec(
            name="crawl", description="Crawl a site",
            parameters={
                "type": "object",
                "properties": {"url": {"type": "string", "minLength": 4}},
                "required": ["url"],
                "additionalProperties": False,
            },
        )
        assert spec.to_openai()["function"]["name"] == "crawl"
        assert spec.to_anthropic()["input_schema"]["type"] == "object"
        # Gemini rejects several JSON Schema keywords outright.
        google = spec.to_google()["parameters"]
        assert "additionalProperties" not in google
        assert "minLength" not in google["properties"]["url"]

    def test_message_translation_is_reversible_in_shape(self):
        provider = AnthropicProvider(api_key="x")
        payload = provider._payload(
            type("R", (), {
                "messages": [Message.user("hello"), Message.assistant("hi")],
                "system": "be useful", "model": "m", "tools": [], "tool_choice": None,
                "max_tokens": 100, "temperature": 0.2, "stop_sequences": [],
                "response_format": None, "extra": {},
            })()
        )
        assert payload["messages"][0]["role"] == "user"
        assert payload["system"][0]["text"] == "be useful"

    async def test_degrades_loudly_with_no_provider(self):
        router = ModelRouter(credentials=[])
        completion = await router.complete([Message.user("write something")])
        assert completion.provider == "echo"
        assert "degraded" in completion.text.lower()

    async def test_tenant_keys_take_precedence(self):
        router = ModelRouter.for_tenant(
            [ProviderCredential("openai", "tenant-key", source="tenant")],
            preferred="openai",
        )
        assert router.available_providers()[0] == "openai"

    def test_tier_resolution_is_per_provider(self):
        router = ModelRouter(credentials=[])
        assert router.resolve_model("anthropic", "fast") != router.resolve_model("anthropic", "deep")
        assert router.resolve_model("openai", "standard").startswith("gpt")

    def test_json_parsing_survives_code_fences(self):
        assert Completion(text='```json\n{"a": 1}\n```').json() == {"a": 1}
        assert Completion(text='Here you go: {"a": 2} cheers').json() == {"a": 2}


class TestPricing:
    def test_unknown_models_are_priced_conservatively(self):
        assert price_for("some-unreleased-model").input_per_m > 0, (
            "an unpriceable model must not be costed at zero"
        )

    def test_local_inference_is_free(self):
        assert price_for("ollama/llama3").input_per_m == 0.0

    def test_cached_tokens_cost_less(self):
        full = estimate_cost("claude-sonnet-5", 100_000, 1_000)
        cached = estimate_cost("claude-sonnet-5", 100_000, 1_000, cached_input_tokens=90_000)
        assert cached < full


class TestSpendGuard:
    def test_refuses_a_call_that_would_breach_the_run_budget(self):
        guard = SpendGuard(run_limit_usd=1.0, org_remaining_usd=100.0)
        guard.record(0.95)
        with pytest.raises(BudgetExceeded):
            guard.check(0.10)

    def test_refuses_when_the_org_budget_is_exhausted(self):
        guard = SpendGuard(run_limit_usd=100.0, org_remaining_usd=0.01)
        with pytest.raises(BudgetExceeded):
            guard.check(1.0)


class TestEmbeddings:
    def test_related_text_scores_higher_than_unrelated(self):
        a = hashing_embed("local seo for dental clinics")
        b = hashing_embed("seo services for dentists and dental practices")
        c = hashing_embed("industrial hydraulic pump maintenance schedules")
        assert cosine(a, b) > cosine(a, c)

    def test_identical_text_is_identical(self):
        assert cosine(hashing_embed("same"), hashing_embed("same")) > 0.999

    def test_chunking_keeps_paragraphs_whole_where_it_can(self):
        text = "\n\n".join(["A short paragraph about something."] * 20)
        chunks = chunk_text(text, target_chars=200)
        assert len(chunks) > 1
        assert all(len(c) < 500 for c in chunks)

    def test_chunking_empty_text(self):
        assert chunk_text("") == []


class TestToolRegistry:
    def test_refuses_a_mutating_tool_with_no_risk(self):
        registry = ToolRegistry()
        with pytest.raises(ValueError, match="risk"):
            registry.register(Tool(
                name="x.write", description="", parameters={},
                handler=None, mutates=True, risk="none",
            ))

    def test_refuses_an_unknown_risk_level(self):
        registry = ToolRegistry()
        with pytest.raises(ValueError, match="unknown risk"):
            registry.register(Tool(
                name="x.write", description="", parameters={},
                handler=None, mutates=True, risk="spicy",
            ))

    def test_pattern_resolution(self):
        from seoos.tools import load_all_tools

        registry = load_all_tools()
        assert len(registry.resolve(["crawl.*"])) >= 3
        assert len(registry.resolve(["category:content"])) >= 3
        assert registry.resolve(["does.not.exist"]) == []

    def test_every_registered_tool_is_documented(self):
        from seoos.tools import load_all_tools

        for tool in load_all_tools().all():
            assert len(tool.description) > 40, f"{tool.name} is barely described"
            assert tool.parameters.get("type") == "object"

    def test_every_mutating_tool_declares_how_it_is_gated(self):
        from seoos.tools import load_all_tools

        for tool in load_all_tools().all():
            if tool.mutates and tool.risk != "internal":
                assert tool.auto_from or tool.risk == "critical", (
                    f"{tool.name} mutates but declares no autonomy floor"
                )

    @pytest.mark.parametrize(
        "site_level,required,allowed",
        [
            ("observe", "assisted", False),
            ("assisted", "assisted", True),
            ("managed", "assisted", True),
            ("propose", "managed", False),
            ("autopilot", "managed", True),
            ("propose", None, True),
        ],
    )
    def test_autonomy_comparison(self, site_level, required, allowed):
        assert autonomy_allows(site_level, required) is allowed


class TestToolExecutor:
    async def test_records_and_survives_a_crashing_tool(self, ctx):
        registry = ToolRegistry()
        calls: list[dict] = []

        async def explode(ctx, **kwargs):
            raise RuntimeError("boom")

        registry.register(Tool(
            name="x.explode", description="", parameters={}, handler=explode,
        ))

        async def recorder(payload):
            calls.append(payload)

        outcome = await ToolExecutor(registry, recorder=recorder).execute("x.explode", {}, ctx)
        assert not outcome.ok
        assert "boom" in outcome.error
        assert calls and calls[0]["ok"] is False

    async def test_unknown_tool_returns_an_error_not_an_exception(self, ctx):
        outcome = await ToolExecutor(ToolRegistry()).execute("nope", {}, ctx)
        assert not outcome.ok and "No such tool" in outcome.error

    async def test_secrets_are_redacted_from_the_record(self, ctx):
        registry = ToolRegistry()
        captured: list[dict] = []

        async def handler(ctx, **kwargs):
            return {"ok": True}

        registry.register(Tool(name="x.auth", description="", parameters={}, handler=handler))

        async def recorder(payload):
            captured.append(payload)

        await ToolExecutor(registry, recorder=recorder).execute(
            "x.auth", {"api_key": "super-secret", "url": "https://x.test"}, ctx
        )
        assert captured[0]["args"]["api_key"] == "***redacted***"
        assert captured[0]["args"]["url"] == "https://x.test"

    async def test_dry_run_does_not_execute_a_mutation(self, ctx):
        registry = ToolRegistry()
        ran = {"yes": False}

        async def handler(ctx, **kwargs):
            ran["yes"] = True
            return {}

        registry.register(Tool(
            name="x.write", description="", parameters={}, handler=handler,
            mutates=True, risk="low", auto_from="propose",
        ))
        ctx.dry_run = True
        outcome = await ToolExecutor(registry).execute("x.write", {}, ctx)
        assert outcome.ok and not ran["yes"]
        assert outcome.data["dry_run"] is True

    def test_large_results_are_truncated_before_reaching_a_model(self):
        outcome = ToolOutcome(ok=True, data={"rows": ["x" * 100] * 500})
        rendered = outcome.to_model_text(max_chars=4000)
        assert len(rendered) <= 4200
        assert "truncated" in rendered
