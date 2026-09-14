"""Request and response models.

Separate from the ORM on purpose. An API contract that is a direct mirror of
the database is one that cannot change either without breaking the other,
and it leaks internal columns to clients.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# -- auth --------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    name: str | None = None
    org_name: str = Field(min_length=2, max_length=200)

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        # Length is the property that matters most; a rule demanding a symbol
        # mostly produces "Password1!" and a sticky note.
        if len(v) < 10:
            raise ValueError("Use at least 10 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict[str, Any]
    org: dict[str, Any]


# -- sites -------------------------------------------------------------------

class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    base_url: str
    business_type: Literal[
        "saas", "ecommerce", "local", "publisher", "agency", "marketplace",
        "b2b_services", "nonprofit", "unknown",
    ] = "unknown"
    industry: str | None = None
    is_ymyl: bool = False
    cms_platform: str = "unknown"
    primary_country: str = "us"
    primary_language: str = "en"
    autonomy: Literal["observe", "propose", "assisted", "managed", "autopilot"] = "propose"

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        from seoos.analysis.http import validate_url

        candidate = (v or "").strip()
        # Only add a scheme to something that has none. Prepending https:// to
        # "file:///etc/passwd" would produce a URL that parses but means
        # nothing, so an explicit non-http scheme is rejected instead.
        if "://" in candidate:
            scheme = candidate.split("://", 1)[0].lower()
            if scheme not in ("http", "https"):
                raise ValueError(f"Only http and https are supported, got {scheme!r}")
        elif ":" in candidate.split("/")[0]:
            raise ValueError("That does not look like a website address")
        else:
            candidate = f"https://{candidate}"
        return validate_url(candidate)


class SiteUpdate(BaseModel):
    name: str | None = None
    business_type: str | None = None
    industry: str | None = None
    is_ymyl: bool | None = None
    cms_platform: str | None = None
    autonomy: Literal["observe", "propose", "assisted", "managed", "autopilot"] | None = None
    policy: dict[str, Any] | None = None
    goals: dict[str, Any] | None = None
    notes: str | None = None


class SiteOut(Base):
    id: str
    name: str
    domain: str
    base_url: str
    business_type: str
    industry: str | None
    is_ymyl: bool
    cms_platform: str
    autonomy: str
    status: str
    onboarding_step: str
    health_score: float | None
    aeo_score: float | None
    authority_score: float | None
    last_crawl_at: datetime | None
    last_audit_at: datetime | None
    primary_country: str
    primary_language: str
    goals: dict[str, Any]
    policy: dict[str, Any]
    created_at: datetime


# -- findings and content ----------------------------------------------------

class FindingOut(Base):
    id: str
    code: str
    category: str
    severity: str
    title: str
    detail: str | None
    recommendation: str | None
    url: str | None
    affected_count: int
    priority_score: float | None
    auto_fixable: bool
    status: str
    first_seen_at: datetime | None
    evidence: dict[str, Any]


class ContentOut(Base):
    id: str
    type: str
    status: str
    title: str
    slug: str | None
    meta_title: str | None
    meta_description: str | None
    primary_keyword: str | None
    word_count: int | None
    brand_score: float | None
    quality_score: float | None
    aeo_score: float | None
    ai_pattern_score: float | None
    unverified_claims: list[Any]
    published_url: str | None
    published_at: datetime | None
    scheduled_for: datetime | None
    created_at: datetime
    updated_at: datetime


class ContentDetail(ContentOut):
    body_markdown: str | None = None
    brief: dict[str, Any] | None = None
    outline: list[Any] | None = None
    gate_results: dict[str, Any] = {}
    internal_links: list[Any] = []
    external_sources: list[Any] = []
    reviewer_notes: str | None = None


class ContentReview(BaseModel):
    decision: Literal["approve", "reject", "request_changes"]
    note: str | None = None
    schedule_for: datetime | None = None


# -- approvals ---------------------------------------------------------------

class ApprovalOut(Base):
    id: str
    type: str
    title: str
    summary: str | None
    rationale: str | None
    expected_impact: str | None
    risk: str
    reversible: bool
    status: str
    preview: dict[str, Any] | None
    diff: str | None
    requested_by_agent: str | None
    auto_approve_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    site_id: str | None


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected", "changes_requested"]
    note: str | None = None


class BulkApproval(BaseModel):
    approval_ids: list[str] = Field(min_length=1, max_length=200)
    decision: Literal["approved", "rejected"]
    note: str | None = None


# -- integrations ------------------------------------------------------------

class ConnectRequest(BaseModel):
    provider: str
    credentials: dict[str, Any] = {}
    config: dict[str, Any] = {}
    site_id: str | None = None


class IntegrationOut(Base):
    id: str
    provider: str
    display_name: str | None
    account_ref: str
    status: str
    capabilities: list[Any]
    last_verified_at: datetime | None
    last_error: str | None
    site_id: str | None


# -- brand -------------------------------------------------------------------

class BrandProfileOut(Base):
    id: str
    version: int
    one_liner: str | None
    value_props: list[Any]
    differentiators: list[Any]
    proof_points: list[Any]
    audiences: list[Any]
    tone_attributes: list[Any]
    reading_level: str | None
    person: str | None
    vocabulary_prefer: list[Any]
    vocabulary_avoid: list[Any]
    banned_phrases: list[Any]
    required_disclaimers: list[Any]
    cta_patterns: list[Any]
    example_passages: list[Any]
    approved_at: datetime | None
    updated_at: datetime


class BrandFactIn(BaseModel):
    statement: str = Field(min_length=3, max_length=2000)
    category: str = "general"
    source_ref: str = Field(min_length=1)
    source_type: Literal["client_asset", "site_page", "external", "client_stated"] = "client_stated"
    valid_until: date | None = None


class BrandAssetOut(Base):
    id: str
    kind: str
    filename: str | None
    title: str | None
    mime_type: str | None
    size_bytes: int | None
    status: str
    summary: str | None
    error: str | None
    created_at: datetime


# -- missions and reports ----------------------------------------------------

class MissionRunOut(Base):
    id: str
    mission_key: str
    title: str | None
    status: str
    trigger: str
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None
    cost_usd: float
    summary: str | None
    outcomes: dict[str, Any]
    escalations: list[Any]
    steps_total: int
    steps_done: int
    current_step: str | None


class RunMissionRequest(BaseModel):
    mission_key: str
    inputs: dict[str, Any] = {}
    dry_run: bool = False


class ScheduleOut(Base):
    id: str
    mission_key: str
    cron: str
    enabled: bool
    last_run_at: datetime | None
    last_status: str | None
    next_run_at: datetime | None
    consecutive_failures: int


class ScheduleUpsert(BaseModel):
    mission_key: str
    cron: str
    enabled: bool = True
    input: dict[str, Any] = {}


class ReportOut(Base):
    id: str
    kind: str
    title: str
    period_start: date | None
    period_end: date | None
    narrative_md: str | None
    data: dict[str, Any]
    share_token: str | None
    is_current: bool
    created_at: datetime
    updated_at: datetime


class DashboardOut(BaseModel):
    site: SiteOut
    scores: dict[str, float | None]
    findings: dict[str, Any]
    content_pipeline: dict[str, int]
    pending_approvals: int
    integrations: list[str]
    capabilities: list[str]
    missing_capabilities: dict[str, list[str]]
    kpis: dict[str, Any]
    ai_visibility: dict[str, Any]
    recent_runs: list[MissionRunOut]
    next_scheduled: datetime | None


class NotificationOut(Base):
    id: str
    kind: str
    severity: str
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime
