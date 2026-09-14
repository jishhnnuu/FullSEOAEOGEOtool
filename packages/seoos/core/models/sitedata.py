"""What we know about the site and its market: crawls, pages, findings,
keywords, clusters, rankings, competitors and AI-answer visibility."""

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

SEVERITIES = ("critical", "high", "medium", "low", "info")
FINDING_STATUS = ("open", "in_progress", "awaiting_approval", "fixed", "verified",
                  "accepted_risk", "wont_fix", "regressed")


class Crawl(Base, IdMixin, TimestampMixin):
    __tablename__ = "crawls"
    __table_args__ = (Index("ix_crawls_site_created", "site_id", "created_at"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    trigger: Mapped[str] = mapped_column(String(30), default="scheduled")
    status: Mapped[str] = mapped_column(String(20), default="running")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    pages_discovered: Mapped[int] = mapped_column(Integer, default=0)
    pages_crawled: Mapped[int] = mapped_column(Integer, default=0)
    pages_failed: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)


class Page(Base, IdMixin, TimestampMixin):
    """One URL. Updated in place across crawls so history stays cheap; the
    interesting deltas are captured as findings and drift events instead."""

    __tablename__ = "pages"
    __table_args__ = (
        UniqueConstraint("site_id", "url_hash", name="uq_pages_site_url"),
        Index("ix_pages_site_indexable", "site_id", "is_indexable"),
        Index("ix_pages_site_template", "site_id", "template_type"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    url_hash: Mapped[str] = mapped_column(String(40), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), default="/")

    status_code: Mapped[int | None] = mapped_column(Integer)
    content_type: Mapped[str | None] = mapped_column(String(120))
    redirect_target: Mapped[str | None] = mapped_column(String(2000))

    title: Mapped[str | None] = mapped_column(String(1000))
    meta_description: Mapped[str | None] = mapped_column(Text)
    h1: Mapped[str | None] = mapped_column(String(1000))
    canonical: Mapped[str | None] = mapped_column(String(2000))
    robots_meta: Mapped[str | None] = mapped_column(String(255))
    lang: Mapped[str | None] = mapped_column(String(16))

    word_count: Mapped[int | None] = mapped_column(Integer)
    content_hash: Mapped[str | None] = mapped_column(String(40))
    reading_level: Mapped[float | None] = mapped_column(Float)

    is_indexable: Mapped[bool] = mapped_column(Boolean, default=True)
    index_blockers: Mapped[list[Any]] = mapped_column(JSON, default=list)
    depth: Mapped[int | None] = mapped_column(Integer)
    internal_inlinks: Mapped[int] = mapped_column(Integer, default=0)
    internal_outlinks: Mapped[int] = mapped_column(Integer, default=0)
    external_outlinks: Mapped[int] = mapped_column(Integer, default=0)

    template_type: Mapped[str | None] = mapped_column(String(40))
    # home | category | product | article | landing | location | doc | other
    schema_types: Mapped[list[Any]] = mapped_column(JSON, default=list)
    hreflang: Mapped[list[Any]] = mapped_column(JSON, default=list)
    images: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # Core Web Vitals, filled from CrUX (field) or Lighthouse (lab).
    lcp_ms: Mapped[float | None] = mapped_column(Float)
    inp_ms: Mapped[float | None] = mapped_column(Float)
    cls: Mapped[float | None] = mapped_column(Float)
    perf_source: Mapped[str | None] = mapped_column(String(20))

    # Scores computed by the analysers; what the dashboard sorts by.
    seo_score: Mapped[float | None] = mapped_column(Float)
    content_score: Mapped[float | None] = mapped_column(Float)
    aeo_score: Mapped[float | None] = mapped_column(Float)
    opportunity_score: Mapped[float | None] = mapped_column(Float)

    # Search Console truth for this URL, joined in by the analyst agent.
    clicks_28d: Mapped[int | None] = mapped_column(Integer)
    impressions_28d: Mapped[int | None] = mapped_column(Integer)
    avg_position: Mapped[float | None] = mapped_column(Float)

    signals: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_crawled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Finding(Base, IdMixin, TimestampMixin):
    """A problem or an opportunity, deduplicated across crawls by fingerprint.

    Findings are the currency of the platform: the audit produces them, the
    planner ranks them, the fixers close them, and the report shows the
    client the open/closed trend rather than a fresh wall of red each month.
    """

    __tablename__ = "findings"
    __table_args__ = (
        UniqueConstraint("site_id", "fingerprint", name="uq_findings_site_fingerprint"),
        Index("ix_findings_site_status_sev", "site_id", "status", "severity"),
        Index("ix_findings_site_category", "site_id", "category"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    code: Mapped[str] = mapped_column(String(80), index=True)
    category: Mapped[str] = mapped_column(String(40))
    # technical | content | schema | performance | aeo | local | offpage |
    # ecommerce | international | ux | compliance | analytics
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    title: Mapped[str] = mapped_column(String(500))
    detail: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)

    url: Mapped[str | None] = mapped_column(String(2000))
    affected_urls: Mapped[list[Any]] = mapped_column(JSON, default=list)
    affected_count: Mapped[int] = mapped_column(Integer, default=1)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # Prioritisation inputs. impact x confidence / effort, computed by the
    # planner so ranking is explainable rather than a black-box score.
    impact: Mapped[float] = mapped_column(Float, default=0.5)
    effort: Mapped[float] = mapped_column(Float, default=0.5)
    confidence: Mapped[float] = mapped_column(Float, default=0.7)
    priority_score: Mapped[float | None] = mapped_column(Float)

    # Can the platform fix this on its own?
    auto_fixable: Mapped[bool] = mapped_column(Boolean, default=False)
    fix_strategy: Mapped[str | None] = mapped_column(String(80))
    fix_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    status: Mapped[str] = mapped_column(String(30), default="open")
    found_by: Mapped[str | None] = mapped_column(String(60))
    crawl_id: Mapped[str | None] = mapped_column(String(32), index=True)
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    regression_count: Mapped[int] = mapped_column(Integer, default=0)
    approval_id: Mapped[str | None] = mapped_column(String(32))


class Cluster(Base, IdMixin, TimestampMixin):
    """A topic cluster: one pillar plus the supporting pages that link to it."""

    __tablename__ = "clusters"
    __table_args__ = (Index("ix_clusters_site_priority", "site_id", "priority_score"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    name: Mapped[str] = mapped_column(String(300))
    slug: Mapped[str | None] = mapped_column(String(300))
    intent: Mapped[str | None] = mapped_column(String(30))
    stage: Mapped[str | None] = mapped_column(String(30))  # awareness|consideration|decision
    pillar_url: Mapped[str | None] = mapped_column(String(2000))
    pillar_content_id: Mapped[str | None] = mapped_column(String(32))

    keyword_count: Mapped[int] = mapped_column(Integer, default=0)
    total_volume: Mapped[int] = mapped_column(Integer, default=0)
    avg_difficulty: Mapped[float | None] = mapped_column(Float)
    coverage_pct: Mapped[float] = mapped_column(Float, default=0.0)
    priority_score: Mapped[float | None] = mapped_column(Float)
    business_value: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    notes: Mapped[str | None] = mapped_column(Text)


class Keyword(Base, IdMixin, TimestampMixin):
    __tablename__ = "keywords"
    __table_args__ = (
        UniqueConstraint("site_id", "phrase", "country", "language", name="uq_keyword_scope"),
        Index("ix_keywords_site_tracked", "site_id", "is_tracked"),
        Index("ix_keywords_cluster", "cluster_id"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    phrase: Mapped[str] = mapped_column(String(500), nullable=False)
    country: Mapped[str] = mapped_column(String(8), default="us")
    language: Mapped[str] = mapped_column(String(8), default="en")

    volume: Mapped[int | None] = mapped_column(Integer)
    difficulty: Mapped[float | None] = mapped_column(Float)
    cpc: Mapped[float | None] = mapped_column(Float)
    intent: Mapped[str | None] = mapped_column(String(30))
    # informational | commercial | transactional | navigational | local
    seasonality: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    cluster_id: Mapped[str | None] = mapped_column(String(32), index=True)
    target_url: Mapped[str | None] = mapped_column(String(2000))
    is_tracked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_branded: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_score: Mapped[float | None] = mapped_column(Float)
    business_value: Mapped[float | None] = mapped_column(Float)

    # Current state, denormalised so dashboards do not need a window query.
    current_position: Mapped[float | None] = mapped_column(Float)
    best_position: Mapped[float | None] = mapped_column(Float)
    position_change_28d: Mapped[float | None] = mapped_column(Float)
    serp_features: Mapped[list[Any]] = mapped_column(JSON, default=list)
    has_ai_overview: Mapped[bool | None] = mapped_column(Boolean)
    source: Mapped[str | None] = mapped_column(String(40))


class Ranking(Base, IdMixin):
    """Time series of position. Kept narrow because it is the biggest table."""

    __tablename__ = "rankings"
    __table_args__ = (
        UniqueConstraint("keyword_id", "captured_on", "engine", "device",
                         name="uq_ranking_point"),
        Index("ix_rankings_site_date", "site_id", "captured_on"),
    )

    site_id: Mapped[str] = mapped_column(String(32), index=True)
    keyword_id: Mapped[str] = mapped_column(String(32), index=True)
    captured_on: Mapped[date] = mapped_column(Date, nullable=False)
    engine: Mapped[str] = mapped_column(String(20), default="google")
    device: Mapped[str] = mapped_column(String(10), default="desktop")
    position: Mapped[float | None] = mapped_column(Float)
    url: Mapped[str | None] = mapped_column(String(2000))
    serp_features: Mapped[list[Any]] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(30), default="gsc")


class Competitor(Base, IdMixin, TimestampMixin):
    __tablename__ = "competitors"
    __table_args__ = (UniqueConstraint("site_id", "domain", name="uq_competitor_site_domain"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20), default="organic")
    # organic | direct | aggregator | marketplace | publisher
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    authority: Mapped[float | None] = mapped_column(Float)
    overlap_keywords: Mapped[int | None] = mapped_column(Integer)
    share_of_voice: Mapped[float | None] = mapped_column(Float)
    ai_share_of_voice: Mapped[float | None] = mapped_column(Float)
    content_velocity: Mapped[float | None] = mapped_column(Float)
    last_analysed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    intel: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class AiVisibilityCheck(Base, IdMixin, TimestampMixin):
    """AEO/GEO measurement: did an answer engine mention or cite this brand?

    One row per prompt per engine per run. This is the table that answers
    "are we visible in ChatGPT" the same way rankings answer "are we visible
    in Google".
    """

    __tablename__ = "ai_visibility_checks"
    __table_args__ = (
        Index("ix_aivis_site_date", "site_id", "captured_on"),
        Index("ix_aivis_site_engine", "site_id", "engine"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_group: Mapped[str | None] = mapped_column(String(200))
    intent: Mapped[str | None] = mapped_column(String(30))
    engine: Mapped[str] = mapped_column(String(40))
    # chatgpt | claude | gemini | perplexity | copilot | ai_overview | ai_mode
    model_ref: Mapped[str | None] = mapped_column(String(120))
    captured_on: Mapped[date] = mapped_column(Date, index=True)
    country: Mapped[str] = mapped_column(String(8), default="us")

    brand_mentioned: Mapped[bool] = mapped_column(Boolean, default=False)
    brand_cited: Mapped[bool] = mapped_column(Boolean, default=False)
    citation_urls: Mapped[list[Any]] = mapped_column(JSON, default=list)
    mention_rank: Mapped[int | None] = mapped_column(Integer)
    sentiment: Mapped[str | None] = mapped_column(String(20))
    accuracy: Mapped[str | None] = mapped_column(String(20))
    # accurate | outdated | misattributed | wrong  -- misinformation about the
    # client in an AI answer is a support ticket, not a ranking metric
    competitors_cited: Mapped[list[Any]] = mapped_column(JSON, default=list)
    answer_excerpt: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(30), default="direct")
