"""Local SEO: the day-to-day work that keeps a physical business visible."""

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


class Location(Base, IdMixin, TimestampMixin):
    __tablename__ = "locations"
    __table_args__ = (Index("ix_locations_site", "site_id"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    name: Mapped[str] = mapped_column(String(300))
    gbp_location_id: Mapped[str | None] = mapped_column(String(200), index=True)
    store_code: Mapped[str | None] = mapped_column(String(120))
    landing_page_url: Mapped[str | None] = mapped_column(String(2000))

    address_line1: Mapped[str | None] = mapped_column(String(300))
    address_line2: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(160))
    region: Mapped[str | None] = mapped_column(String(160))
    postal_code: Mapped[str | None] = mapped_column(String(40))
    country: Mapped[str] = mapped_column(String(8), default="us")
    phone: Mapped[str | None] = mapped_column(String(60))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)

    primary_category: Mapped[str | None] = mapped_column(String(200))
    secondary_categories: Mapped[list[Any]] = mapped_column(JSON, default=list)
    services: Mapped[list[Any]] = mapped_column(JSON, default=list)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    hours: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    special_hours: Mapped[list[Any]] = mapped_column(JSON, default=list)

    verification_status: Mapped[str | None] = mapped_column(String(40))
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    profile_completeness: Mapped[float | None] = mapped_column(Float)
    review_count: Mapped[int | None] = mapped_column(Integer)
    avg_rating: Mapped[float | None] = mapped_column(Float)
    photo_count: Mapped[int | None] = mapped_column(Integer)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Map pack visibility measured on a geo grid around the pin.
    grid_avg_rank: Mapped[float | None] = mapped_column(Float)
    grid_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grid_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class Review(Base, IdMixin, TimestampMixin):
    """Reviews are a ranking factor and a reputation asset. The platform
    drafts every reply; who presses send depends on autonomy level, and a
    negative review always goes to a human first."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("location_id", "external_id", name="uq_review_external"),
        Index("ix_reviews_site_status", "site_id", "reply_status"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    location_id: Mapped[str] = mapped_column(String(32), index=True)

    platform: Mapped[str] = mapped_column(String(40), default="google")
    external_id: Mapped[str] = mapped_column(String(400))
    author_name: Mapped[str | None] = mapped_column(String(300))
    rating: Mapped[int | None] = mapped_column(Integer)
    text: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(8))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sentiment: Mapped[str | None] = mapped_column(String(20))
    topics: Mapped[list[Any]] = mapped_column(JSON, default=list)
    is_actionable: Mapped[bool] = mapped_column(Boolean, default=False)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)

    reply_draft: Mapped[str | None] = mapped_column(Text)
    reply_status: Mapped[str] = mapped_column(String(20), default="none")
    # none | drafted | awaiting_approval | approved | posted | skipped
    reply_posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approval_id: Mapped[str | None] = mapped_column(String(32))


class GbpPost(Base, IdMixin, TimestampMixin):
    __tablename__ = "gbp_posts"

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    location_id: Mapped[str] = mapped_column(String(32), index=True)

    topic_type: Mapped[str] = mapped_column(String(30), default="STANDARD")
    summary: Mapped[str] = mapped_column(Text)
    cta_type: Mapped[str | None] = mapped_column(String(40))
    cta_url: Mapped[str | None] = mapped_column(String(2000))
    media_url: Mapped[str | None] = mapped_column(String(2000))
    event: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    offer: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    status: Mapped[str] = mapped_column(String(20), default="drafted")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    external_id: Mapped[str | None] = mapped_column(String(400))
    approval_id: Mapped[str | None] = mapped_column(String(32))
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)


class Citation(Base, IdMixin, TimestampMixin):
    """NAP listings across directories. Consistency is the whole point."""

    __tablename__ = "citations"
    __table_args__ = (
        UniqueConstraint("location_id", "directory", name="uq_citation_location_directory"),
        Index("ix_citations_site_status", "site_id", "status"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    location_id: Mapped[str] = mapped_column(String(32), index=True)

    directory: Mapped[str] = mapped_column(String(160))
    listing_url: Mapped[str | None] = mapped_column(String(2000))
    submitted_name: Mapped[str | None] = mapped_column(String(300))
    submitted_address: Mapped[str | None] = mapped_column(String(500))
    submitted_phone: Mapped[str | None] = mapped_column(String(60))

    status: Mapped[str] = mapped_column(String(30), default="missing")
    # missing | inconsistent | pending | claimed | verified | duplicate | rejected
    mismatches: Mapped[list[Any]] = mapped_column(JSON, default=list)
    authority: Mapped[float | None] = mapped_column(Float)
    priority: Mapped[int] = mapped_column(Integer, default=3)
    requires_human: Mapped[bool] = mapped_column(Boolean, default=False)
    human_reason: Mapped[str | None] = mapped_column(String(300))
    last_checked_on: Mapped[date | None] = mapped_column(Date)
    approval_id: Mapped[str | None] = mapped_column(String(32))
