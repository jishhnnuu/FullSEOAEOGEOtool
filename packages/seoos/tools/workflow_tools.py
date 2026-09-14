"""Workflow: escalation, institutional memory, scheduling and experiments."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from seoos.core.models import Experiment, Resolution, Schedule
from seoos.tools._helpers import array, boolean, integer, load_site, obj, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool


@tool(
    "workflow.check_memory",
    """Read what the team has already learned about this site: problems
    solved, decisions taken, and what would reverse them.

    Read this before attempting anything that previously failed. A problem
    solved once should never be worked twice.""",
    schema(
        signature_=string("A specific problem signature to look up"),
        limit_=integer("How many entries", minimum=1, maximum=50, default=20),
    ),
    category="workflow",
)
async def check_memory(
    ctx: ToolContext, signature: str | None = None, limit: int = 20
) -> ToolOutcome:
    stmt = select(Resolution).where(Resolution.status == "active")
    if ctx.site_id:
        stmt = stmt.where(
            (Resolution.site_id == ctx.site_id)
            | (Resolution.scope.in_(["org", "platform"]))
        )
    if signature:
        stmt = stmt.where(Resolution.signature == signature)
    rows = list(
        (await ctx.session.execute(stmt.order_by(Resolution.created_at.desc()).limit(limit)))
        .scalars().all()
    )
    return ToolOutcome(
        ok=True,
        summary=f"{len(rows)} resolutions on record",
        data={
            "resolutions": [
                {
                    "problem": r.problem,
                    "decision": r.decision,
                    "rationale": r.rationale,
                    "reverses_if": r.reverses_if,
                    "rung_reached": r.rung_reached,
                    "human_required": r.human_required,
                    "human_atom": r.human_atom,
                    "scope": r.scope,
                    "reuse_count": r.reuse_count,
                }
                for r in rows
            ]
        },
    )


@tool(
    "workflow.log_resolution",
    """Record how a blocker was resolved, so nobody re-solves it.

    Also the only sanctioned way to record that something genuinely needs a
    human: describe the single irreducible action, with everything around it
    already prepared, so their part takes under a minute.""",
    schema(
        problem=string("What was blocking, specifically"),
        decision=string("What was decided or done instead"),
        rationale_=string("Why this was the right call"),
        reverses_if_=string("What evidence would change this decision"),
        attempts_=array("What was tried before this, in order", {"type": "object"}),
        rung_reached_=integer("Which rung of the ladder resolved it", minimum=1, maximum=7),
        human_required_=boolean("Does this still need a person", default=False),
        human_atom_=string("The single action a person must take, if any"),
        scope_=string("How widely this applies", enum=["site", "org", "platform"], default="site"),
    ),
    category="workflow",
    mutates=True,
    risk="internal",
    auto_from="observe",
)
async def log_resolution(
    ctx: ToolContext,
    problem: str,
    decision: str,
    rationale: str | None = None,
    reverses_if: str | None = None,
    attempts: list[dict] | None = None,
    rung_reached: int = 1,
    human_required: bool = False,
    human_atom: str | None = None,
    scope: str = "site",
) -> ToolOutcome:
    from seoos.agents.resolver import signature_for

    signature = signature_for(problem)
    existing = (
        await ctx.session.execute(
            select(Resolution).where(
                Resolution.signature == signature,
                Resolution.site_id == ctx.site_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.reuse_count += 1
        existing.decision = decision
        existing.rung_reached = max(existing.rung_reached, rung_reached)
        await ctx.session.flush()
        return ToolOutcome(
            ok=True,
            summary=f"Updated existing resolution (seen {existing.reuse_count + 1} times)",
            data={"resolution_id": existing.id, "signature": signature},
        )

    row = Resolution(
        org_id=ctx.org_id,
        site_id=ctx.site_id if scope == "site" else None,
        scope=scope,
        problem=problem,
        signature=signature,
        rung_reached=rung_reached,
        attempts=attempts or [],
        decision=decision,
        rationale=rationale,
        reverses_if=reverses_if,
        resolved_by=ctx.agent_key,
        human_required=human_required,
        human_atom=human_atom,
    )
    ctx.session.add(row)
    await ctx.session.flush()

    if human_required and human_atom:
        from seoos.tools.reporting_tools import report_notify

        await report_notify(
            ctx,
            title=f"One thing needs you: {problem[:120]}",
            body=(
                f"{human_atom}\n\nEverything around it is prepared. "
                f"Nothing else is blocked by this."
            ),
            severity="action_required",
        )

    return ToolOutcome(
        ok=True,
        summary=f"Resolution logged at rung {rung_reached}"
                + (" and escalated to the client" if human_required else ""),
        data={"resolution_id": row.id, "signature": signature},
    )


@tool(
    "workflow.schedule_mission",
    """Schedule a recurring mission for this site. Use this during onboarding
    to set the cadence, and to adjust it when a site's needs change.""",
    schema(
        mission_key=string("Which mission to run"),
        cron=string("Standard 5-field cron, in UTC"),
        enabled_=boolean("Turn it on", default=True),
        input_=obj("Fixed arguments for every run"),
    ),
    category="workflow",
    mutates=True,
    risk="low",
    auto_from="assisted",
)
async def schedule_mission(
    ctx: ToolContext,
    mission_key: str,
    cron: str,
    enabled: bool = True,
    input: dict | None = None,
) -> ToolOutcome:
    from croniter import croniter

    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    if not croniter.is_valid(cron):
        return ToolOutcome(ok=False, error=f"{cron!r} is not a valid cron expression")

    from seoos.missions.registry import get_mission_registry

    registry = get_mission_registry()
    if not registry.has(mission_key):
        return ToolOutcome(
            ok=False,
            error=f"No mission named {mission_key!r}. Known: {', '.join(registry.keys())}",
        )

    row = (
        await ctx.session.execute(
            select(Schedule).where(
                Schedule.site_id == site.id, Schedule.mission_key == mission_key
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = Schedule(
            org_id=ctx.org_id, site_id=site.id, mission_key=mission_key, cron=cron
        )
        ctx.session.add(row)
    row.cron = cron
    row.enabled = enabled
    row.input = input or {}
    row.next_run_at = croniter(cron, datetime.now(UTC)).get_next(datetime)
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=f"{mission_key} scheduled ({cron}), next run {row.next_run_at:%Y-%m-%d %H:%M} UTC",
        data={"schedule_id": row.id, "next_run_at": row.next_run_at.isoformat()},
    )


@tool(
    "workflow.create_experiment",
    """Set up an SEO split test: a change applied to some pages and withheld
    from comparable ones, measured against a named metric.

    Almost no SEO work is tested this way, which is why so much of it cannot
    be defended. Use this for changes applied to a template or a page group.""",
    schema(
        name=string("Short name for the test"),
        hypothesis=string("What you expect to happen and why"),
        change_description=string("Exactly what changes on the variant pages"),
        variant_urls=array("Pages receiving the change", {"type": "string"}, max_items=500),
        control_urls=array("Comparable pages left unchanged", {"type": "string"}, max_items=500),
        metric_=string("What to measure", enum=["clicks", "impressions", "position", "ctr",
                                                "conversions"], default="clicks"),
        duration_days_=integer("How long to run", minimum=14, maximum=120, default=28),
    ),
    category="workflow",
    mutates=True,
    risk="low",
    auto_from="assisted",
)
async def create_experiment(
    ctx: ToolContext,
    name: str,
    hypothesis: str,
    change_description: str,
    variant_urls: list[str],
    control_urls: list[str],
    metric: str = "clicks",
    duration_days: int = 28,
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    if len(variant_urls) < 5 or len(control_urls) < 5:
        return ToolOutcome(
            ok=False,
            error=(
                "A split test needs at least five pages in each group. Below that, "
                "normal week-to-week variance swamps any effect and the result "
                "means nothing."
            ),
        )

    baseline = await _baseline_for(ctx, variant_urls + control_urls, metric)
    row = Experiment(
        org_id=ctx.org_id,
        site_id=site.id,
        name=name,
        hypothesis=hypothesis,
        change_description=change_description,
        metric=metric,
        variant_urls=variant_urls,
        control_urls=control_urls,
        started_on=date.today(),
        ends_on=date.today() + timedelta(days=duration_days),
        status="running",
        baseline=baseline,
    )
    ctx.session.add(row)
    await ctx.session.flush()
    return ToolOutcome(
        ok=True,
        summary=(
            f"Experiment '{name}' running: {len(variant_urls)} variant vs "
            f"{len(control_urls)} control pages, reads out in {duration_days} days"
        ),
        data={"experiment_id": row.id, "ends_on": row.ends_on.isoformat(),
              "baseline": baseline},
    )


async def _baseline_for(ctx: ToolContext, urls: list[str], metric: str) -> dict:
    """Capture the pre-change measurement. Without it there is nothing to
    compare against and the test is decoration."""
    from seoos.tools._helpers import has_connector

    if not await has_connector(ctx, "google_search_console"):
        return {"captured": False, "reason": "Search Console is not connected"}
    from seoos.tools._helpers import connector_for

    connector = await connector_for(ctx, "google_search_console")
    async with connector:
        result = await connector.page_metrics(days=28)
    if not result.ok:
        return {"captured": False, "reason": result.error}
    rows = result.data
    return {
        "captured": True,
        "period_days": 28,
        "per_url": {u: rows.get(u, {}).get(metric, 0) for u in urls},
        "total": sum(rows.get(u, {}).get(metric, 0) for u in urls),
    }


@tool(
    "workflow.read_experiment",
    """Read an experiment's result: variant versus control, the lift, and
    whether the difference is large enough to act on.""",
    schema(experiment_id=string("The experiment")),
    category="workflow",
)
async def read_experiment(ctx: ToolContext, experiment_id: str) -> ToolOutcome:
    row = (
        await ctx.session.execute(
            select(Experiment).where(
                Experiment.id == experiment_id, Experiment.site_id == ctx.site_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return ToolOutcome(ok=False, error="Experiment not found")

    from seoos.tools._helpers import connector_for, has_connector

    if not await has_connector(ctx, "google_search_console"):
        return ToolOutcome(ok=False, error="Search Console is needed to read the result")

    connector = await connector_for(ctx, "google_search_console")
    async with connector:
        current = await connector.page_metrics(days=28)
    if not current.ok:
        return ToolOutcome(ok=False, error=current.error)

    analysis = analyse_experiment(row, current.data)
    row.result = analysis
    row.lift_pct = analysis.get("lift_pct")
    row.verdict = analysis.get("verdict")
    if date.today() >= (row.ends_on or date.today()):
        row.status = "concluded"
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=(
            f"'{row.name}': variant {analysis['variant_change_pct']:+.1f}%, "
            f"control {analysis['control_change_pct']:+.1f}%, "
            f"lift {analysis['lift_pct']:+.1f}% ({analysis['verdict']})"
        ),
        data=analysis,
    )


def analyse_experiment(experiment: Experiment, current: dict) -> dict:
    """Difference in differences.

    Comparing the variant to its own past would credit seasonality and algorithm
    updates to our change. Comparing the variant's change to the control's
    change over the same window removes most of that.
    """
    metric = experiment.metric
    baseline = (experiment.baseline or {}).get("per_url", {})

    def total(urls: list[str], source: dict) -> float:
        return sum(float((source.get(u) or {}).get(metric, 0) or 0) for u in urls)

    def base_total(urls: list[str]) -> float:
        return sum(float(baseline.get(u, 0) or 0) for u in urls)

    variant_before = base_total(experiment.variant_urls)
    control_before = base_total(experiment.control_urls)
    variant_after = total(experiment.variant_urls, current)
    control_after = total(experiment.control_urls, current)

    variant_change = ((variant_after - variant_before) / variant_before * 100) if variant_before else 0.0
    control_change = ((control_after - control_before) / control_before * 100) if control_before else 0.0
    lift = variant_change - control_change

    # A deliberately blunt significance rule. With page-group data at this
    # scale, a real effect is large; anything under ten points is noise dressed
    # up as a result, and calling it a win teaches the system the wrong lesson.
    sample = len(experiment.variant_urls) + len(experiment.control_urls)
    if sample < 20 or abs(lift) < 10:
        verdict = "inconclusive"
    elif lift >= 10:
        verdict = "positive"
    else:
        verdict = "negative"

    return {
        "metric": metric,
        "variant_before": variant_before,
        "variant_after": variant_after,
        "control_before": control_before,
        "control_after": control_after,
        "variant_change_pct": round(variant_change, 1),
        "control_change_pct": round(control_change, 1),
        "lift_pct": round(lift, 1),
        "verdict": verdict,
        "sample_pages": sample,
        "note": (
            "Difference in differences: the control group absorbs seasonality "
            "and algorithm movement, so the lift is attributable to the change."
        ),
    }
