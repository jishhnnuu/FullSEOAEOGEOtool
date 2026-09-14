"""Tenancy: who the customer is, what sites they own, who may act."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from seoos.core.db import Base, IdMixin, TimestampMixin

# Autonomy levels. This is the dial the customer turns to decide how much
# the platform does without asking. It is the single most important product
# setting, so it is modelled explicitly rather than as a pile of booleans.
AUTONOMY_LEVELS = (
    "observe",    # analyse and report only; change nothing
    "propose",    # draft everything, approve everything
    "assisted",   # auto-apply reversible technical fixes; approve all content
    "managed",    # auto-apply fixes + auto-publish content the client pre-approved by policy
    "autopilot",  # everything inside policy ships; the client sees a digest
)

ROLES = ("viewer", "approver", "editor", "admin", "owner")


class Org(Base, IdMixin, TimestampMixin):
    """A customer. Everything else hangs off this."""

    __tablename__ = "orgs"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(40), default="trial")
    status: Mapped[str] = mapped_column(String(20), default="active")

    # Spend governance. The platform refuses to exceed these no matter what
    # an agent decides, and the cost controller agent keeps runs inside them.
    monthly_budget_usd: Mapped[float] = mapped_column(Float, default=150.0)
    daily_budget_usd: Mapped[float] = mapped_column(Float, default=25.0)
    spend_mtd_usd: Mapped[float] = mapped_column(Float, default=0.0)

    # Model routing. A customer may bring their own provider and keys; if set,
    # nothing about their workload touches the platform's default provider.
    llm_provider: Mapped[str | None] = mapped_column(String(40))
    llm_model: Mapped[str | None] = mapped_column(String(120))

    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    sites: Mapped[list[Site]] = relationship(back_populates="org", cascade="all, delete-orphan")
    memberships: Mapped[list[Membership]] = relationship(
        back_populates="org", cascade="all, delete-orphan"
    )


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(200))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Approval routing: how this person wants to be told there is work for them.
    notify_channels: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    memberships: Mapped[list[Membership]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Membership(Base, IdMixin, TimestampMixin):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_membership_org_user"),)

    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="owner")

    org: Mapped[Org] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class Site(Base, IdMixin, TimestampMixin):
    """One website under management. The unit everything is scoped to."""

    __tablename__ = "sites"
    __table_args__ = (
        UniqueConstraint("org_id", "domain", name="uq_site_org_domain"),
        Index("ix_sites_org_status", "org_id", "status"),
    )

    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # What kind of business this is drives which playbook runs. Detected
    # during onboarding, overridable by the client.
    business_type: Mapped[str] = mapped_column(String(40), default="unknown")
    industry: Mapped[str | None] = mapped_column(String(120))
    is_ymyl: Mapped[bool] = mapped_column(Boolean, default=False)

    # Where the site actually lives, so the publisher knows how to write to it.
    cms_platform: Mapped[str] = mapped_column(String(40), default="unknown")
    cms_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    primary_country: Mapped[str] = mapped_column(String(8), default="us")
    primary_language: Mapped[str] = mapped_column(String(8), default="en")
    locales: Mapped[list[Any]] = mapped_column(JSON, default=list)

    autonomy: Mapped[str] = mapped_column(String(20), default="propose")
    status: Mapped[str] = mapped_column(String(20), default="onboarding")
    onboarding_step: Mapped[str] = mapped_column(String(40), default="created")

    # Live scores shown on the dashboard, refreshed by every audit mission,
    # so the client's report is never stale by more than one cycle.
    health_score: Mapped[float | None] = mapped_column(Float)
    aeo_score: Mapped[float | None] = mapped_column(Float)
    authority_score: Mapped[float | None] = mapped_column(Float)
    last_audit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_crawl_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Per-site policy overrides on top of the org defaults.
    policy: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    goals: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)

    org: Mapped[Org] = relationship(back_populates="sites")


class ApiKey(Base, IdMixin, TimestampMixin):
    """Programmatic access for a customer's own automation."""

    __tablename__ = "api_keys"

    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(16), index=True)
    key_hash: Mapped[str] = mapped_column(String(255))
    scopes: Mapped[list[Any]] = mapped_column(JSON, default=list)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base, IdMixin, TimestampMixin):
    """Every state change an agent or human made, with enough detail to undo.

    Agencies get fired for unexplained changes. This table is what makes the
    platform defensible: for any live change there is a row saying which
    agent proposed it, which human approved it, and what the site looked
    like before.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_org_created", "org_id", "created_at"),
        Index("ix_audit_object", "object_type", "object_id"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    actor_type: Mapped[str] = mapped_column(String(20))  # user | agent | system | webhook
    actor_id: Mapped[str | None] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(80), index=True)
    object_type: Mapped[str] = mapped_column(String(60))
    object_id: Mapped[str | None] = mapped_column(String(64))
    summary: Mapped[str | None] = mapped_column(Text)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    reversible: Mapped[bool] = mapped_column(Boolean, default=False)
    reverted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mission_run_id: Mapped[str | None] = mapped_column(String(32), index=True)
    ip: Mapped[str | None] = mapped_column(String(64))
    severity: Mapped[int] = mapped_column(Integer, default=0)
