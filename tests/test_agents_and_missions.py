"""The roster, the mission definitions and the resolver ladder."""

from __future__ import annotations

import pytest
from seoos.agents.policy import ApprovalPolicy
from seoos.agents.registry import get_registry
from seoos.agents.resolver import Resolver, Route, signature_for
from seoos.agents.spec import AgentSpec
from seoos.core.errors import SafetyRefusal, ValidationFailed
from seoos.missions.registry import get_mission_registry
from seoos.missions.spec import MissionSpec, evaluate, render, resolve_path
from seoos.tools import load_all_tools


class TestRoster:
    def test_loads_and_validates(self):
        registry = get_registry()
        assert len(registry.keys()) >= 40, "the roster should cover a full agency"
        assert registry.validate() == []

    def test_every_agent_has_tools_that_exist(self):
        tools = load_all_tools()
        for spec in get_registry().all():
            resolved = tools.resolve(spec.tools)
            assert resolved, f"{spec.key} resolves to no tools"

    def test_departments_are_covered(self):
        departments = {s.department for s in get_registry().all()}
        for required in (
            "leadership", "strategy", "research", "technical", "content",
            "aeo", "offpage", "local", "operations",
        ):
            assert required in departments, f"no agent covers {required}"

    def test_house_rules_reach_every_prompt(self):
        for spec in get_registry().all():
            prompt = spec.render_system_prompt()
            assert "No em dashes" in prompt
            assert "Evidence." in prompt

    def test_rejects_a_spec_without_front_matter(self):
        with pytest.raises(ValidationFailed):
            AgentSpec.from_markdown("# Just a heading")

    def test_rejects_an_unknown_department(self):
        with pytest.raises(ValidationFailed):
            AgentSpec.from_markdown(
                "---\nkey: x\nname: X\nrole: X\ndepartment: nonsense\n---\nBody"
            )

    def test_delegation_targets_exist(self):
        registry = get_registry()
        for spec in registry.all():
            for target in spec.delegates_to:
                assert registry.has(target), f"{spec.key} delegates to missing {target}"


class TestMissions:
    def test_all_missions_validate(self):
        registry = get_mission_registry()
        assert len(registry.keys()) >= 5
        assert registry.validate() == []

    def test_execution_order_respects_dependencies(self):
        for spec in get_mission_registry().all():
            seen: set[str] = set()
            for wave in spec.execution_order():
                for step in wave:
                    assert all(n in seen for n in step.needs), (
                        f"{spec.key}.{step.id} runs before its dependencies"
                    )
                seen.update(s.id for s in wave)

    def test_detects_a_dependency_cycle(self):
        with pytest.raises(ValidationFailed):
            MissionSpec.from_dict({
                "key": "loop", "name": "Loop",
                "steps": [
                    {"id": "a", "type": "tool", "tool": "crawl.robots", "needs": ["b"]},
                    {"id": "b", "type": "tool", "tool": "crawl.robots", "needs": ["a"]},
                ],
            })

    def test_rejects_unknown_dependencies(self):
        with pytest.raises(ValidationFailed):
            MissionSpec.from_dict({
                "key": "x", "name": "X",
                "steps": [{"id": "a", "type": "tool", "tool": "crawl.robots", "needs": ["ghost"]}],
            })

    def test_site_filtering_respects_business_type(self):
        registry = get_mission_registry()
        local_only = [m for m in registry.all() if m.business_types == ["local"]]
        assert local_only, "expected at least one local-only mission"
        for_saas = registry.for_site(
            business_type="saas", capabilities=set(), status="active"
        )
        assert local_only[0].key not in {m.key for m in for_saas}


class TestConditions:
    @pytest.mark.parametrize(
        "condition,expected",
        [
            ("a.b > 5", True),
            ("a.b > 50", False),
            ("a.b >= 12", True),
            ("a.c == 'managed'", True),
            ("a.c != 'managed'", False),
            ("items not_empty", True),
            ("empty is_empty", True),
            ("missing.key not_exists", True),
            ("a.b exists", True),
            ("a.b > 5 and items not_empty", True),
            ("a.b > 50 or items not_empty", True),
            ("not a.b > 50", True),
            ("tags contains 'x'", True),
        ],
    )
    def test_evaluates(self, condition, expected):
        state = {"a": {"b": 12, "c": "managed"}, "items": [1], "empty": [], "tags": ["x"]}
        assert evaluate(condition, state) is expected

    def test_refuses_to_silently_pass_a_broken_condition(self):
        # A gate that cannot be parsed must fail loudly. Passing it would let a
        # step that was meant to be gated run unconditionally.
        with pytest.raises(ValidationFailed):
            evaluate("this is not a condition", {})

    def test_templating_substitutes_and_tolerates_gaps(self):
        state = {"run": {"pages": 42}}
        assert render("Found {{ run.pages }} pages", state) == "Found 42 pages"
        assert render("{{ nope.missing }}", state) == ""

    def test_resolve_path_handles_indices(self):
        assert resolve_path({"a": [{"b": 7}]}, "a[0].b") == 7
        assert resolve_path({"a": []}, "a[3].b") is None


class TestResolver:
    async def test_takes_the_first_route_that_works(self):
        async def fails():
            raise RuntimeError("field data unavailable")

        async def works():
            return {"lcp": 2400, "source": "lab"}

        result = await Resolver().resolve(
            "no field data",
            [
                Route("crux", 2, fails, 1.0, "CrUX field data"),
                Route("lighthouse", 3, works, 0.7, "Lab data"),
            ],
        )
        assert result.resolved
        assert result.route_used == "lighthouse"
        assert result.degraded
        assert [a.succeeded for a in result.attempts] == [False, True]

    async def test_escalates_to_a_single_human_action(self):
        async def fails():
            raise RuntimeError("nope")

        result = await Resolver().resolve(
            "cannot verify the listing",
            [Route("api", 2, fails, 1.0, "API")],
            human_atom="Enter the six-digit code Google posts to the business address.",
        )
        assert not result.resolved
        assert result.human_required
        assert result.rung_reached == 7
        assert "six-digit" in result.human_atom

    async def test_refuses_a_forbidden_route_outright(self):
        async def anything():
            return True

        with pytest.raises(SafetyRefusal):
            await Resolver().resolve(
                "need links fast",
                [Route("buy_links", 3, anything, 1.0, "Buy links")],
            )

    async def test_reuses_a_logged_resolution(self):
        memory: dict = {}
        resolver = Resolver(memory=memory)

        calls = {"n": 0}

        async def works():
            calls["n"] += 1
            return "ok"

        problem = "provider unavailable"
        await resolver.resolve(problem, [Route("fallback", 3, works, 0.8, "Fallback")])
        assert signature_for(problem) in memory
        await resolver.resolve(problem, [Route("fallback", 3, works, 0.8, "Fallback")])
        assert calls["n"] == 2  # still executed, but the route was recalled first

    async def test_skips_a_route_already_known_to_fail(self):
        memory = {
            signature_for("x"): {"failed_routes": ["dead"], "decision_route": None},
        }
        attempted = {"dead": 0, "live": 0}

        async def dead():
            attempted["dead"] += 1
            raise RuntimeError("no")

        async def live():
            attempted["live"] += 1
            return "ok"

        result = await Resolver(memory=memory).resolve(
            "x", [Route("dead", 2, dead), Route("live", 3, live)]
        )
        assert result.resolved
        assert attempted["dead"] == 0, "a known-dead route should not be retried"


class TestApprovalPolicy:
    async def test_refuses_a_banned_tactic_regardless_of_autonomy(self, ctx):
        from seoos.tools.registry import Tool

        tool = Tool(
            name="offpage.buy", description="", parameters={},
            handler=None, mutates=True, risk="high", tags=("buy_backlinks",),
        )
        ctx.site.autonomy = "autopilot"
        decision = await ApprovalPolicy().evaluate(tool, {}, ctx)
        assert decision.refuse
        assert not decision.requires_approval

    async def test_irreversible_actions_always_need_a_human(self, ctx):
        from seoos.tools.registry import Tool

        tool = Tool(
            name="publish.write_robots", description="", parameters={},
            handler=None, mutates=True, risk="critical",
        )
        for level in ("propose", "assisted", "managed", "autopilot"):
            ctx.site.autonomy = level
            ctx.autonomy = level
            decision = await ApprovalPolicy().evaluate(tool, {}, ctx)
            assert decision.requires_approval, f"robots.txt slipped through at {level}"

    async def test_content_always_reaches_the_client_by_default(self, ctx):
        from seoos.tools.registry import Tool

        tool = Tool(
            name="publish.content", description="", parameters={}, handler=None,
            mutates=True, risk="high", approval_type="content_publish",
            auto_from="managed",
        )
        ctx.site.autonomy = "managed"
        ctx.autonomy = "managed"
        decision = await ApprovalPolicy().evaluate(tool, {"content_type": "article"}, ctx)
        assert decision.requires_approval

    async def test_pre_approved_content_types_skip_the_queue(self, ctx):
        from seoos.tools.registry import Tool

        tool = Tool(
            name="publish.content", description="", parameters={}, handler=None,
            mutates=True, risk="high", approval_type="content_publish",
            auto_from="managed",
        )
        ctx.site.autonomy = "managed"
        ctx.site.policy = {"auto_publish_types": ["article"]}
        decision = await ApprovalPolicy().evaluate(tool, {"content_type": "article"}, ctx)
        assert not decision.requires_approval

    async def test_protected_paths_are_honoured(self, ctx):
        from seoos.tools.registry import Tool

        tool = Tool(
            name="publish.update_meta", description="", parameters={}, handler=None,
            mutates=True, risk="low", auto_from="assisted",
        )
        ctx.site.policy = {"never_touch_paths": ["/legal"]}
        decision = await ApprovalPolicy().evaluate(
            tool, {"url": "https://example.com/legal/terms"}, ctx
        )
        assert decision.requires_approval
        assert decision.rule == "protected_path"

    async def test_observe_mode_blocks_every_mutation(self, ctx):
        from seoos.tools.registry import Tool, ToolExecutor, ToolRegistry

        registry = ToolRegistry()

        async def handler(ctx, **kwargs):
            return {"did": "something"}

        registry.register(Tool(
            name="x.mutate", description="", parameters={}, handler=handler,
            mutates=True, risk="low", auto_from="propose",
        ))
        ctx.autonomy = "observe"
        outcome = await ToolExecutor(registry, policy=ApprovalPolicy()).execute("x.mutate", {}, ctx)
        assert not outcome.ok
        assert "observe-only" in (outcome.error or "")
