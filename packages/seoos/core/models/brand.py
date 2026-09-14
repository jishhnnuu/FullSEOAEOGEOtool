"""The brand brain.

The single biggest reason AI-written SEO content gets rejected is that it
does not sound like the company and makes claims the company cannot stand
behind. Three tables solve that:

* :class:`BrandAsset`  what the client gave us (or what we found on their site)
* :class:`BrandProfile` the distilled, versioned voice and positioning
* :class:`BrandFact`   the claim ledger: every factual assertion a writer may
  make, with its source, so nothing is invented
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from seoos.core.db import Base, IdMixin, TimestampMixin

ASSET_KINDS = (
    "style_guide", "brand_book", "tone_of_voice", "logo", "product_sheet",
    "case_study", "whitepaper", "pitch_deck", "price_list", "faq",
    "transcript", "press_release", "existing_content", "site_page",
    "competitor_reference", "legal_disclaimer", "persona_doc", "other",
)


class BrandAsset(Base, IdMixin, TimestampMixin):
    __tablename__ = "brand_assets"
    __table_args__ = (Index("ix_brand_assets_site_kind", "site_id", "kind"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    kind: Mapped[str] = mapped_column(String(40), default="other")
    source: Mapped[str] = mapped_column(String(20), default="upload")  # upload | crawl | connector
    filename: Mapped[str | None] = mapped_column(String(400))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    storage_key: Mapped[str | None] = mapped_column(String(600))
    source_url: Mapped[str | None] = mapped_column(String(1000))

    title: Mapped[str | None] = mapped_column(String(400))
    extracted_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[Any]] = mapped_column(JSON, default=list)

    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    # uploaded | extracting | extracted | indexed | failed | superseded
    error: Mapped[str | None] = mapped_column(Text)
    # Chunk embeddings live here as a compact JSON list so the platform needs
    # no vector database to run. A pgvector column is a drop-in upgrade.
    embedding_chunks: Mapped[list[Any] | None] = mapped_column(JSON)


class BrandProfile(Base, IdMixin, TimestampMixin):
    """Versioned. A new version is written rather than mutating the old one,
    so any published page can be traced to the voice rules in force when it
    was written."""

    __tablename__ = "brand_profiles"
    __table_args__ = (Index("ix_brand_profiles_site_version", "site_id", "version"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Positioning
    one_liner: Mapped[str | None] = mapped_column(Text)
    value_props: Mapped[list[Any]] = mapped_column(JSON, default=list)
    differentiators: Mapped[list[Any]] = mapped_column(JSON, default=list)
    proof_points: Mapped[list[Any]] = mapped_column(JSON, default=list)
    audiences: Mapped[list[Any]] = mapped_column(JSON, default=list)
    personas: Mapped[list[Any]] = mapped_column(JSON, default=list)
    competitors: Mapped[list[Any]] = mapped_column(JSON, default=list)

    # Voice
    tone_attributes: Mapped[list[Any]] = mapped_column(JSON, default=list)
    reading_level: Mapped[str | None] = mapped_column(String(40))
    person: Mapped[str | None] = mapped_column(String(20))  # first | second | third
    sentence_rhythm: Mapped[str | None] = mapped_column(String(200))
    vocabulary_prefer: Mapped[list[Any]] = mapped_column(JSON, default=list)
    vocabulary_avoid: Mapped[list[Any]] = mapped_column(JSON, default=list)
    banned_phrases: Mapped[list[Any]] = mapped_column(JSON, default=list)
    formatting_rules: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    example_passages: Mapped[list[Any]] = mapped_column(JSON, default=list)

    # Guardrails the editor enforces before anything reaches a human
    claims_policy: Mapped[str | None] = mapped_column(Text)
    compliance_notes: Mapped[str | None] = mapped_column(Text)
    required_disclaimers: Mapped[list[Any]] = mapped_column(JSON, default=list)
    cta_patterns: Mapped[list[Any]] = mapped_column(JSON, default=list)
    boilerplate: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    derived_from: Mapped[list[Any]] = mapped_column(JSON, default=list)  # asset ids
    confidence: Mapped[float | None] = mapped_column(Float)
    approved_by: Mapped[str | None] = mapped_column(String(32))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BrandFact(Base, IdMixin, TimestampMixin):
    """One verifiable assertion the brand is willing to make in public.

    Writers may only state facts that exist here or that they cite to an
    external source. That is what keeps an autonomous writer from inventing
    a statistic and putting the client's name on it.
    """

    __tablename__ = "brand_facts"
    __table_args__ = (Index("ix_brand_facts_site_status", "site_id", "status"),)

    org_id: Mapped[str] = mapped_column(String(32), index=True)
    site_id: Mapped[str] = mapped_column(String(32), index=True)

    statement: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="general")
    # pricing | capability | credential | metric | policy | people | general
    source_type: Mapped[str] = mapped_column(String(30), default="client_asset")
    source_ref: Mapped[str | None] = mapped_column(String(1000))
    asset_id: Mapped[str | None] = mapped_column(String(32), index=True)

    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="active")
    # active | needs_review | expired | retracted
    confidence: Mapped[float] = mapped_column(Float, default=0.8)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    sensitivity: Mapped[str] = mapped_column(String(20), default="public")
