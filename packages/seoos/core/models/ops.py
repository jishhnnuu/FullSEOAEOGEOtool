"""Operations: how work is scheduled, executed, approved, measured and paid for.

This is the machinery that makes the platform an agency rather than a tool.
A mission is a unit of delivered work; an agent run is one specialist doing
one job inside it; an approval is the only place a human is required.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from seoos.core.db import Base, IdMixin, TimestampMixin

RUN_STATUS = ("queued", "running", "waiting_approval", "succeeded",
              "partial", "failed", "cancelled", "skipped")

APPROVAL_TYPES = (
    "content_publish", "content_update", "technical_fix", "schema_change",
    "redirect", "robots_change", "sitemap_change", "outreach_send",
    "gbp_post", "review_reply", "citation_submit", "social_post",
    "disavow", "budget_increase", "brand_profile", "strategy_change",
    "connector_scope", "migration", "bulk_edit", "other",
)

RISK_LEVELS = ("low", "medium", "high", "critical")


class MissionRun(Base, IdMixin, TimestampMixin):
    """One execution of a workflow, e.g. ``weekly_growth_cycle``.

    Missions are the client-facing unit of work: the report says "we ran the
    content cycle and published 4 pages", not "we made 900 API calls".
    """

    __tablename__ = "mission_runs"
    __table_args__ = (
        Index("ix_mission_runs_site_started", "site_id", "started_at"),
        Index("ix_mission_runs_status", "status"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)

    mission_key: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str | None] = mapped_column(String(400))
    trigger: Mapped[str] = mapped_column(String(30), default="schedule")
    # schedule | manual | webhook | chained | alert | onboarding
    triggered_by: Mapped[str | None] = mapped_column(String(120))
    parent_run_id: Mapped[str | None] = mapped_column(String(32), index=True)
    schedule_id: Mapped[str | None] = mapped_column(String(32), index=True)

    status: Mapped[str] = mapped_column(String(30), default="queued")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    input: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # The blackboard: shared state every step of the mission reads and writes.
    state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    summary: Mapped[str | None] = mapped_column(Text)

    steps_total: Mapped[int] = mapped_column(Integer, default=0)
    steps_done: Mapped[int] = mapped_column(Integer, default=0)
    current_step: Mapped[str | None] = mapped_column(String(120))

    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    budget_usd: Mapped[float | None] = mapped_column(Float)

    error: Mapped[str | None] = mapped_column(Text)
    escalations: Mapped[list[Any]] = mapped_column(JSON, default=list)
    artifacts: Mapped[list[Any]] = mapped_column(JSON, default=list)
    # What changed in the world because of this run. Drives the client digest.
    outcomes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class AgentRun(Base, IdMixin, TimestampMixin):
    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("ix_agent_runs_mission", "mission_run_id", "created_at"),
        Index("ix_agent_runs_site_agent", "site_id", "agent_key"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    mission_run_id: Mapped[str | None] = mapped_column(String(32), index=True)
    parent_agent_run_id: Mapped[str | None] = mapped_column(String(32))

    agent_key: Mapped[str] = mapped_column(String(80), index=True)
    task: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    depth: Mapped[int] = mapped_column(Integer, default=0)

    provider: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(120))
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    tool_call_count: Mapped[int] = mapped_column(Integer, default=0)
    iterations: Mapped[int] = mapped_column(Integer, default=0)

    input: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    reasoning_summary: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)


class ToolCall(Base, IdMixin):
    """Every external action an agent took. The forensic record."""

    __tablename__ = "tool_calls"
    __table_args__ = (Index("ix_tool_calls_agent_run", "agent_run_id", "created_at"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    org_id: Mapped[str] = mapped_column(String(32), index=True)
    agent_run_id: Mapped[str] = mapped_column(String(32), index=True)
    mission_run_id: Mapped[str | None] = mapped_column(String(32), index=True)

    tool: Mapped[str] = mapped_column(String(80), index=True)
    args: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    result_summary: Mapped[str | None] = mapped_column(Text)
    result_bytes: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    # True when the call changed something outside the platform.
    is_mutation: Mapped[bool] = mapped_column(Boolean, default=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)


class Approval(Base, IdMixin, TimestampMixin):
    """The client's entire job, in one table.

    An approval always carries a human-readable summary, a preview of the
    exact change, the reasoning behind it, and what happens if it is ignored.
    Anything that cannot be explained in those terms should not be asked.
    """

    __tablename__ = "approvals"
    __table_args__ = (
        Index("ix_approvals_site_status", "site_id", "status"),
        Index("ix_approvals_org_status_created", "org_id", "status", "created_at"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)

    type: Mapped[str] = mapped_column(String(40), index=True)
    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    expected_impact: Mapped[str | None] = mapped_column(Text)
    risk: Mapped[str] = mapped_column(String(20), default="low")
    reversible: Mapped[bool] = mapped_column(Boolean, default=True)

    # What will happen on approval, in a form the executor can replay exactly.
    action: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    preview: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    diff: Mapped[str | None] = mapped_column(Text)
    object_type: Mapped[str | None] = mapped_column(String(60))
    object_id: Mapped[str | None] = mapped_column(String(32), index=True)

    requested_by_agent: Mapped[str | None] = mapped_column(String(80))
    mission_run_id: Mapped[str | None] = mapped_column(String(32), index=True)

    status: Mapped[str] = mapped_column(String(30), default="pending")
    # pending | approved | rejected | changes_requested | auto_approved |
    # expired | cancelled | executed | failed
    decided_by: Mapped[str | None] = mapped_column(String(32))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)

    # Standing-instruction handling: a policy may auto-approve after a wait,
    # so an inattentive client never becomes the bottleneck for low-risk work.
    auto_approve_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    policy_rule: Mapped[str | None] = mapped_column(String(120))
    batch_key: Mapped[str | None] = mapped_column(String(120), index=True)

    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    execution_result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    execution_error: Mapped[str | None] = mapped_column(Text)


class Schedule(Base, IdMixin, TimestampMixin):
    __tablename__ = "schedules"
    __table_args__ = (
        UniqueConstraint("site_id", "mission_key", name="uq_schedule_site_mission"),
        Index("ix_schedules_next_run", "enabled", "next_run_at"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    mission_key: Mapped[str] = mapped_column(String(80))
    cron: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(60), default="UTC")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    input: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_run_id: Mapped[str | None] = mapped_column(String(32))
    last_status: Mapped[str | None] = mapped_column(String(30))
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    # A lease so two workers never run the same schedule twice.
    locked_by: Mapped[str | None] = mapped_column(String(80))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Report(Base, IdMixin, TimestampMixin):
    """A generated deliverable. The always-current audit lives here as the
    row with ``kind='live_audit'``, rewritten by every audit mission."""

    __tablename__ = "reports"
    __table_args__ = (Index("ix_reports_site_kind", "site_id", "kind", "created_at"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    kind: Mapped[str] = mapped_column(String(40), default="live_audit")
    # live_audit | monthly | quarterly | competitor | content | local |
    # aeo | backlinks | incident | onboarding
    title: Mapped[str] = mapped_column(String(400))
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)

    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    narrative_md: Mapped[str | None] = mapped_column(Text)
    html_key: Mapped[str | None] = mapped_column(String(600))
    pdf_key: Mapped[str | None] = mapped_column(String(600))
    share_token: Mapped[str | None] = mapped_column(String(64), index=True)
    share_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    status: Mapped[str] = mapped_column(String(20), default="ready")
    generated_by: Mapped[str | None] = mapped_column(String(80))
    mission_run_id: Mapped[str | None] = mapped_column(String(32))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)


class CostLedger(Base, IdMixin):
    """Every dollar spent, attributed to a site and a run.

    An agency that cannot say what a client cost goes out of business. This
    also feeds the hard ceilings that stop a loop from running away.
    """

    __tablename__ = "cost_ledger"
    __table_args__ = (Index("ix_cost_org_day", "org_id", "day"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)

    category: Mapped[str] = mapped_column(String(30))  # llm | serp | backlinks | render | email
    provider: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str | None] = mapped_column(String(200))
    units: Mapped[float] = mapped_column(Float, default=0.0)
    unit_kind: Mapped[str | None] = mapped_column(String(30))
    usd: Mapped[float] = mapped_column(Float, default=0.0)
    mission_run_id: Mapped[str | None] = mapped_column(String(32), index=True)
    agent_run_id: Mapped[str | None] = mapped_column(String(32))


class Resolution(Base, IdMixin, TimestampMixin):
    """Institutional memory. A problem solved once is never re-solved.

    Every agent reads the open resolutions for its site before starting, and
    a resolution that applies to every client gets promoted to the shared
    playbook rather than living in one tenant.
    """

    __tablename__ = "resolutions"
    __table_args__ = (Index("ix_resolutions_site_scope", "site_id", "scope"),)

    org_id: Mapped[str | None] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    scope: Mapped[str] = mapped_column(String(20), default="site")  # site | org | platform

    problem: Mapped[str] = mapped_column(Text)
    signature: Mapped[str] = mapped_column(String(120), index=True)
    rung_reached: Mapped[int] = mapped_column(Integer, default=1)
    attempts: Mapped[list[Any]] = mapped_column(JSON, default=list)
    decision: Mapped[str] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    reverses_if: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="active")
    human_required: Mapped[bool] = mapped_column(Boolean, default=False)
    human_atom: Mapped[str | None] = mapped_column(Text)
    reuse_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Experiment(Base, IdMixin, TimestampMixin):
    """SEO split testing. Almost no tool does this, and it is the only honest
    way to know whether a change helped."""

    __tablename__ = "experiments"

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    name: Mapped[str] = mapped_column(String(300))
    hypothesis: Mapped[str] = mapped_column(Text)
    change_description: Mapped[str | None] = mapped_column(Text)
    metric: Mapped[str] = mapped_column(String(60), default="clicks")
    variant_urls: Mapped[list[Any]] = mapped_column(JSON, default=list)
    control_urls: Mapped[list[Any]] = mapped_column(JSON, default=list)

    started_on: Mapped[date | None] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="designed")
    # designed | running | analysing | concluded | abandoned
    baseline: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    lift_pct: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)
    verdict: Mapped[str | None] = mapped_column(String(30))
    rollout_status: Mapped[str | None] = mapped_column(String(30))


class KpiSnapshot(Base, IdMixin):
    """Daily facts for the dashboard and for regression detection."""

    __tablename__ = "kpi_snapshots"
    __table_args__ = (
        UniqueConstraint("site_id", "measured_on", "metric", "dimension",
                         name="uq_kpi_point"),
        Index("ix_kpi_site_metric_date", "site_id", "metric", "measured_on"),
    )

    site_id: Mapped[str] = mapped_column(String(32), index=True)
    org_id: Mapped[str] = mapped_column(String(32), index=True)
    measured_on: Mapped[date] = mapped_column(Date)
    metric: Mapped[str] = mapped_column(String(60))
    dimension: Mapped[str] = mapped_column(String(120), default="")
    value: Mapped[float] = mapped_column(Float, default=0.0)
    source: Mapped[str] = mapped_column(String(30), default="gsc")
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class Notification(Base, IdMixin, TimestampMixin):
    """What the client is told, and through which channel. Deliberately
    sparse: an autonomous system that pings constantly gets muted."""

    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_org_read", "org_id", "read_at"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)

    kind: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20), default="info")
    title: Mapped[str] = mapped_column(String(400))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(1000))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    channels: Mapped[list[Any]] = mapped_column(JSON, default=list)
    delivered: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    digest_key: Mapped[str | None] = mapped_column(String(80), index=True)
