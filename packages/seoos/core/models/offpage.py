"""Off-page: the part almost no SEO tool executes, only reports on.

Agencies earn most of their fee here. The platform does the prospecting,
qualification, asset design and drafting autonomously, and stops exactly at
the point where sending under the client's name needs a human signature or
the client's own mail credentials.
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

TACTICS = (
    "digital_pr", "broken_link", "unlinked_mention", "resource_page",
    "guest_contribution", "expert_quote", "data_study", "tool_asset",
    "podcast", "partnership", "supplier_listing", "local_sponsorship",
    "directory", "community_profile", "citation",
)


class Backlink(Base, IdMixin, TimestampMixin):
    __tablename__ = "backlinks"
    __table_args__ = (
        UniqueConstraint("site_id", "link_hash", name="uq_backlink_site_hash"),
        Index("ix_backlinks_site_status", "site_id", "status"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    link_hash: Mapped[str] = mapped_column(String(40), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2000))
    source_domain: Mapped[str] = mapped_column(String(255), index=True)
    target_url: Mapped[str] = mapped_column(String(2000))
    anchor_text: Mapped[str | None] = mapped_column(String(1000))
    rel: Mapped[str | None] = mapped_column(String(80))
    is_dofollow: Mapped[bool] = mapped_column(Boolean, default=True)
    placement: Mapped[str | None] = mapped_column(String(30))  # editorial|footer|sidebar|comment

    domain_authority: Mapped[float | None] = mapped_column(Float)
    spam_score: Mapped[float | None] = mapped_column(Float)
    topical_relevance: Mapped[float | None] = mapped_column(Float)
    traffic_estimate: Mapped[int | None] = mapped_column(Integer)

    status: Mapped[str] = mapped_column(String(20), default="live")
    # live | lost | nofollowed | redirected | toxic | disavowed | pending_verify
    risk_flags: Mapped[list[Any]] = mapped_column(JSON, default=list)
    attributed_to: Mapped[str | None] = mapped_column(String(32))  # outreach thread id
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(30), default="crawl")


class LinkProspect(Base, IdMixin, TimestampMixin):
    """A qualified opportunity, scored before a single word is written."""

    __tablename__ = "link_prospects"
    __table_args__ = (
        UniqueConstraint("site_id", "domain", "tactic", name="uq_prospect_site_domain_tactic"),
        Index("ix_prospects_site_status", "site_id", "status"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    target_page_url: Mapped[str | None] = mapped_column(String(2000))
    tactic: Mapped[str] = mapped_column(String(40), default="digital_pr")
    rationale: Mapped[str | None] = mapped_column(Text)
    our_asset_url: Mapped[str | None] = mapped_column(String(2000))
    our_content_id: Mapped[str | None] = mapped_column(String(32))

    authority: Mapped[float | None] = mapped_column(Float)
    relevance: Mapped[float | None] = mapped_column(Float)
    traffic_estimate: Mapped[int | None] = mapped_column(Integer)
    link_likelihood: Mapped[float | None] = mapped_column(Float)
    priority_score: Mapped[float | None] = mapped_column(Float)
    # Refusal gate: a prospect that looks like a link farm, a PBN, or a paid
    # placement is marked here and can never be promoted to outreach.
    disqualified_reason: Mapped[str | None] = mapped_column(String(300))

    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_role: Mapped[str | None] = mapped_column(String(120))
    contact_source: Mapped[str | None] = mapped_column(String(200))
    social_handles: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    status: Mapped[str] = mapped_column(String(30), default="new")
    # new | qualified | disqualified | queued | contacted | replied |
    # negotiating | won | lost | do_not_contact
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    last_touched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    won_backlink_id: Mapped[str | None] = mapped_column(String(32))


class OutreachThread(Base, IdMixin, TimestampMixin):
    """A conversation with one prospect. Sequenced, throttled and logged.

    The platform will draft, personalise and schedule. Whether it may press
    send depends on the site's autonomy level and on the client having
    connected their own sending domain; it never sends from platform infra.
    """

    __tablename__ = "outreach_threads"
    __table_args__ = (Index("ix_outreach_site_status", "site_id", "status"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    prospect_id: Mapped[str] = mapped_column(String(32), index=True)

    campaign: Mapped[str | None] = mapped_column(String(200))
    channel: Mapped[str] = mapped_column(String(20), default="email")
    subject: Mapped[str | None] = mapped_column(String(500))
    angle: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="drafted")
    # drafted | awaiting_approval | approved | sending | sent | opened |
    # replied | won | lost | bounced | unsubscribed | blocked
    step: Mapped[int] = mapped_column(Integer, default=1)
    max_steps: Mapped[int] = mapped_column(Integer, default=3)
    next_action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approval_id: Mapped[str | None] = mapped_column(String(32))
    outcome: Mapped[str | None] = mapped_column(String(60))
    outcome_url: Mapped[str | None] = mapped_column(String(2000))
    notes: Mapped[str | None] = mapped_column(Text)


class OutreachMessage(Base, IdMixin, TimestampMixin):
    __tablename__ = "outreach_messages"
    __table_args__ = (Index("ix_outreach_msg_thread", "thread_id", "created_at"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    thread_id: Mapped[str] = mapped_column(String(32), index=True)
    direction: Mapped[str] = mapped_column(String(10), default="out")
    step: Mapped[int] = mapped_column(Integer, default=1)
    subject: Mapped[str | None] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    personalisation: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message_id: Mapped[str | None] = mapped_column(String(400))
    error: Mapped[str | None] = mapped_column(Text)
    sent_by: Mapped[str | None] = mapped_column(String(60))
    scheduled_on: Mapped[date | None] = mapped_column(Date)
