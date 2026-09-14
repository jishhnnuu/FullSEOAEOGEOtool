"""Integrations: the accounts a client connects, and the sealed credentials."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from seoos.core.db import Base, IdMixin, TimestampMixin

# Everything a client can connect. Grouped by what it unlocks.
PROVIDERS = {
    # search + analytics
    "google_search_console": "Query, page and indexing data straight from Google",
    "google_analytics_4": "Sessions, conversions and revenue attribution",
    "google_business_profile": "Local listings, posts, reviews, Q&A",
    "google_ads": "Keyword Planner volumes and paid/organic overlap",
    "google_merchant_center": "Product feed health for commerce sites",
    "bing_webmaster": "Bing index coverage, backlinks and IndexNow",
    "youtube": "Video SEO and channel performance",
    # CMS / where the site lives
    "wordpress": "Publish and edit via the WordPress REST API",
    "shopify": "Products, collections, blogs and metafields",
    "webflow": "CMS collections and page metadata",
    "ghost": "Posts and pages via the Admin API",
    "contentful": "Structured content entries",
    "sanity": "Structured content documents",
    "strapi": "Self-hosted headless CMS",
    "hubspot": "CMS pages and blog",
    "squarespace": "Pages and blog posts",
    "wix": "Site content and SEO settings",
    "github": "Static sites: changes arrive as reviewable pull requests",
    "custom_http": "Any CMS with a documented write API",
    # social + distribution
    "linkedin": "Company page posting and engagement data",
    "facebook": "Page posting",
    "instagram": "Business account posting",
    "x": "Posting and mention monitoring",
    "pinterest": "Pin publishing for visual commerce",
    "reddit": "Read-only monitoring; the platform never auto-posts",
    "mailchimp": "Newsletter distribution of published content",
    "sendgrid": "Outreach delivery under the client's own domain",
    "smtp": "Outreach delivery through the client's own mail server",
    # data providers
    "dataforseo": "SERPs, keywords, backlinks, LLM mentions",
    "moz": "Domain and page authority, spam score",
    "ahrefs": "Backlinks and organic keywords",
    "semrush": "Keyword and competitor data",
    "serper": "Low-cost SERP fetches",
    "firecrawl": "Large-scale rendered crawling",
    # AI visibility
    "openai": "ChatGPT answer checks and model access",
    "anthropic": "Claude answer checks and model access",
    "perplexity": "Perplexity answer checks",
    "google_gemini": "Gemini and AI Overview checks",
}

CREDENTIAL_KINDS = ("oauth2", "api_key", "basic", "service_account", "app_password", "token")


class Integration(Base, IdMixin, TimestampMixin):
    """A connected account. One row per provider per site (or per org)."""

    __tablename__ = "integrations"
    __table_args__ = (
        UniqueConstraint("org_id", "site_id", "provider", "account_ref",
                         name="uq_integration_scope"),
        Index("ix_integration_site_provider", "site_id", "provider"),
    )

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(60), nullable=False)

    # The provider-side identity: a GSC property, a GA4 property id, a GBP
    # location group, a Shopify shop domain. Empty string rather than NULL so
    # the unique constraint behaves the same on SQLite and Postgres.
    account_ref: Mapped[str] = mapped_column(String(255), default="")
    display_name: Mapped[str | None] = mapped_column(String(255))

    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending | connected | degraded | expired | revoked | error
    scopes: Mapped[list[Any]] = mapped_column(JSON, default=list)
    capabilities: Mapped[list[Any]] = mapped_column(JSON, default=list)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    error_count: Mapped[int] = mapped_column(Integer, default=0)

    credential_id: Mapped[str | None] = mapped_column(String(32), index=True)


class Credential(Base, IdMixin, TimestampMixin):
    """Sealed secret material. The plaintext never leaves ``seoos.core.crypto``."""

    __tablename__ = "credentials"
    __table_args__ = (Index("ix_credentials_org_provider", "org_id", "provider"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), default="api_key")

    # JSON envelope produced by seoos.core.crypto.seal(). Opaque here on purpose.
    sealed: Mapped[str] = mapped_column(Text, nullable=False)

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refreshable: Mapped[bool] = mapped_column(Boolean, default=False)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fingerprint: Mapped[str | None] = mapped_column(String(64))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookEndpoint(Base, IdMixin, TimestampMixin):
    """Outbound notifications into the client's own stack (Slack, Teams, custom)."""

    __tablename__ = "webhook_endpoints"

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str | None] = mapped_column(String(32), index=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), default="generic")  # slack|teams|generic
    events: Mapped[list[Any]] = mapped_column(JSON, default=list)
    secret_sealed: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
