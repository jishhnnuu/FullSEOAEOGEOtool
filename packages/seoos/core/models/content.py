"""Content: the pipeline from idea to published page, and what happened next.

The client's only mandatory job is approving what sits in ``review``. Every
other transition is the platform's to make.
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

CONTENT_STATUS = (
    "idea",          # the strategist proposed it
    "briefed",       # a brief exists with keywords, outline, links, sources
    "drafting",      # a writer agent holds it
    "editing",       # editor, fact-checker, humaniser and brand keeper pass
    "qa",            # automated gates: schema, links, plagiarism, claims
    "review",        # THE human step: the client approves or comments
    "changes_requested",
    "approved",
    "scheduled",
    "publishing",
    "published",
    "updating",      # a refresh cycle is rewriting a live page
    "archived",
    "rejected",
)

CONTENT_TYPES = (
    "article", "pillar", "comparison", "listicle", "how_to", "glossary",
    "landing_page", "product_page", "category_page", "case_study", "faq",
    "location_page", "meta_rewrite", "on_page_update", "programmatic",
    "press_release", "social_post", "gbp_post", "email", "schema_patch",
)


class ContentItem(Base, IdMixin, TimestampMixin):
    __tablename__ = "content_items"
    __table_args__ = (
        Index("ix_content_site_status", "site_id", "status"),
        Index("ix_content_site_publish", "site_id", "scheduled_for"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    type: Mapped[str] = mapped_column(String(40), default="article")
    status: Mapped[str] = mapped_column(String(30), default="idea")
    title: Mapped[str] = mapped_column(String(600))
    slug: Mapped[str | None] = mapped_column(String(400))
    meta_title: Mapped[str | None] = mapped_column(String(400))
    meta_description: Mapped[str | None] = mapped_column(Text)

    primary_keyword: Mapped[str | None] = mapped_column(String(400))
    secondary_keywords: Mapped[list[Any]] = mapped_column(JSON, default=list)
    cluster_id: Mapped[str | None] = mapped_column(String(32), index=True)
    search_intent: Mapped[str | None] = mapped_column(String(30))
    target_url: Mapped[str | None] = mapped_column(String(2000))
    funnel_stage: Mapped[str | None] = mapped_column(String(30))

    brief: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    outline: Mapped[list[Any] | None] = mapped_column(JSON)
    body_markdown: Mapped[str | None] = mapped_column(Text)
    body_html: Mapped[str | None] = mapped_column(Text)
    front_matter: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    schema_jsonld: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    internal_links: Mapped[list[Any]] = mapped_column(JSON, default=list)
    external_sources: Mapped[list[Any]] = mapped_column(JSON, default=list)
    media: Mapped[list[Any]] = mapped_column(JSON, default=list)
    word_count: Mapped[int | None] = mapped_column(Integer)

    # Quality gates. Nothing reaches ``review`` with a failing gate, so the
    # human is only ever asked to judge substance, never spelling.
    brand_score: Mapped[float | None] = mapped_column(Float)
    quality_score: Mapped[float | None] = mapped_column(Float)
    aeo_score: Mapped[float | None] = mapped_column(Float)
    readability_score: Mapped[float | None] = mapped_column(Float)
    originality_score: Mapped[float | None] = mapped_column(Float)
    ai_pattern_score: Mapped[float | None] = mapped_column(Float)
    claims_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    unverified_claims: Mapped[list[Any]] = mapped_column(JSON, default=list)
    gate_results: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # Ownership and workflow
    created_by_agent: Mapped[str | None] = mapped_column(String(60))
    assigned_agent: Mapped[str | None] = mapped_column(String(60))
    approval_id: Mapped[str | None] = mapped_column(String(32), index=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    revision_count: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)

    # Publishing
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_url: Mapped[str | None] = mapped_column(String(2000))
    cms_ref: Mapped[str | None] = mapped_column(String(400))
    publish_error: Mapped[str | None] = mapped_column(Text)

    # Lifecycle after publication
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decay_score: Mapped[float | None] = mapped_column(Float)
    priority_score: Mapped[float | None] = mapped_column(Float)
    estimated_traffic: Mapped[int | None] = mapped_column(Integer)
    mission_run_id: Mapped[str | None] = mapped_column(String(32), index=True)
    source_finding_id: Mapped[str | None] = mapped_column(String(32))


class ContentVersion(Base, IdMixin, TimestampMixin):
    """Immutable snapshot at every meaningful transition.

    Needed for three reasons: the client can see exactly what they approved,
    a bad publish can be rolled back, and the performance agent can attribute
    a traffic change to a specific revision.
    """

    __tablename__ = "content_versions"
    __table_args__ = (
        UniqueConstraint("content_id", "version", name="uq_content_version"),
        Index("ix_content_versions_content", "content_id"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    content_id: Mapped[str] = mapped_column(String(32), index=True)
    version: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(30))
    author: Mapped[str] = mapped_column(String(60))  # agent key or user id
    title: Mapped[str | None] = mapped_column(String(600))
    body_markdown: Mapped[str | None] = mapped_column(Text)
    front_matter: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    diff_summary: Mapped[str | None] = mapped_column(Text)
    scores: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)


class ContentPerformance(Base, IdMixin):
    """Closes the loop: what did this page actually do after it went live?

    The writer agents read aggregates of this table before drafting, so the
    system gets better at the specific job of ranking *this* client rather
    than writing generically good prose.
    """

    __tablename__ = "content_performance"
    __table_args__ = (
        UniqueConstraint("content_id", "measured_on", name="uq_content_perf_point"),
        Index("ix_content_perf_site_date", "site_id", "measured_on"),
    )

    site_id: Mapped[str] = mapped_column(String(32), index=True)
    content_id: Mapped[str] = mapped_column(String(32), index=True)
    url: Mapped[str | None] = mapped_column(String(2000))
    measured_on: Mapped[date] = mapped_column(Date)
    days_since_publish: Mapped[int | None] = mapped_column(Integer)

    clicks: Mapped[int] = mapped_column(Integer, default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    ctr: Mapped[float | None] = mapped_column(Float)
    avg_position: Mapped[float | None] = mapped_column(Float)
    sessions: Mapped[int | None] = mapped_column(Integer)
    conversions: Mapped[int | None] = mapped_column(Integer)
    revenue: Mapped[float | None] = mapped_column(Float)
    ai_citations: Mapped[int] = mapped_column(Integer, default=0)
    backlinks_earned: Mapped[int] = mapped_column(Integer, default=0)
    verdict: Mapped[str | None] = mapped_column(String(30))
    # winning | on_track | underperforming | decaying | failed
    lesson: Mapped[str | None] = mapped_column(Text)


class MediaAsset(Base, IdMixin, TimestampMixin):
    """Images, diagrams and video scripts generated or sourced for content."""

    __tablename__ = "media_assets"

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    content_id: Mapped[str | None] = mapped_column(String(32), index=True)

    kind: Mapped[str] = mapped_column(String(30), default="image")
    purpose: Mapped[str | None] = mapped_column(String(60))
    storage_key: Mapped[str | None] = mapped_column(String(600))
    remote_url: Mapped[str | None] = mapped_column(String(2000))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    size_bytes: Mapped[int | None] = mapped_column(Integer)

    alt_text: Mapped[str | None] = mapped_column(String(1000))
    caption: Mapped[str | None] = mapped_column(Text)
    filename_slug: Mapped[str | None] = mapped_column(String(300))
    # Provenance matters: AI-generated imagery gets an IPTC DigitalSourceType
    # label so the client is never accidentally passing synthetic media off
    # as a photograph.
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    generator: Mapped[str | None] = mapped_column(String(80))
    prompt: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="ready")
