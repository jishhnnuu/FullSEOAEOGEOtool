"""The brand brain: uploads, voice profile and the fact ledger."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select

from seoos.api.schemas import BrandAssetOut, BrandFactIn, BrandProfileOut
from seoos.api.security import Session, Tenant, get_site, require
from seoos.core.config import get_settings
from seoos.core.db import TenantContext
from seoos.core.models import BrandAsset, BrandFact, BrandProfile
from seoos.services.audit_log import record_event

router = APIRouter(prefix="/sites/{site_id}/brand", tags=["brand"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/csv": "csv",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
}


@router.get("/profile", response_model=BrandProfileOut | None)
async def get_profile(site_id: str, tenant: Tenant, session: Session) -> BrandProfile | None:
    site = await get_site(session, tenant, site_id)
    return (
        await session.execute(
            select(BrandProfile)
            .where(BrandProfile.site_id == site.id, BrandProfile.is_active.is_(True))
            .order_by(BrandProfile.version.desc())
        )
    ).scalars().first()


@router.patch("/profile", response_model=BrandProfileOut)
async def edit_profile(
    site_id: str, payload: dict, session: Session, tenant: TenantContext = require("editor")
) -> BrandProfile:
    """Let the client correct the voice profile.

    The platform derives a first pass from their own writing, but they know
    their brand better than any inference does, and an uncorrectable profile
    is one they stop trusting.
    """
    site = await get_site(session, tenant, site_id)
    profile = (
        await session.execute(
            select(BrandProfile)
            .where(BrandProfile.site_id == site.id, BrandProfile.is_active.is_(True))
            .order_by(BrandProfile.version.desc())
        )
    ).scalars().first()
    if profile is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No brand profile yet. Run onboarding, or upload brand material first.",
        )

    editable = {
        "one_liner", "value_props", "differentiators", "proof_points", "audiences",
        "personas", "tone_attributes", "reading_level", "person", "sentence_rhythm",
        "vocabulary_prefer", "vocabulary_avoid", "banned_phrases",
        "required_disclaimers", "cta_patterns", "claims_policy", "example_passages",
    }
    changed = [k for k in payload if k in editable]
    for field in changed:
        setattr(profile, field, payload[field])
    profile.approved_by = tenant.user_id
    profile.approved_at = datetime.now(UTC)
    await session.flush()
    await record_event(
        session, org_id=tenant.org_id, site_id=site.id,
        action="brand.profile_edited", object_type="brand_profile",
        object_id=profile.id, actor_type="user", actor_id=tenant.user_id,
        summary=f"Client edited: {', '.join(changed)}",
    )
    return profile


@router.get("/assets", response_model=list[BrandAssetOut])
async def list_assets(site_id: str, tenant: Tenant, session: Session) -> list[BrandAsset]:
    site = await get_site(session, tenant, site_id)
    rows = (
        await session.execute(
            select(BrandAsset)
            .where(BrandAsset.site_id == site.id)
            .order_by(BrandAsset.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post("/assets", response_model=BrandAssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    site_id: str,
    session: Session,
    file: UploadFile = File(...),
    kind: str = Form("other"),
    tenant: TenantContext = require("editor"),
) -> BrandAsset:
    """Upload brand material: style guides, case studies, price lists, decks.

    Text is extracted and indexed immediately so writers can use it in the
    next run rather than after a batch job nobody watches.
    """
    site = await get_site(session, tenant, site_id)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Files must be under {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"{file.content_type} is not supported. Accepted: "
            + ", ".join(sorted(set(ALLOWED_TYPES.values()))),
        )

    settings = get_settings()
    digest = hashlib.blake2b(content, digest_size=16).hexdigest()
    storage_dir = Path(settings.storage_dir) / tenant.org_id / site.id
    storage_dir.mkdir(parents=True, exist_ok=True)
    extension = ALLOWED_TYPES[file.content_type]
    storage_path = storage_dir / f"{digest}.{extension}"
    storage_path.write_bytes(content)

    asset = BrandAsset(
        org_id=tenant.org_id,
        site_id=site.id,
        kind=kind,
        source="upload",
        filename=file.filename,
        mime_type=file.content_type,
        size_bytes=len(content),
        storage_key=str(storage_path),
        title=(file.filename or "").rsplit(".", 1)[0],
        status="uploaded",
    )
    session.add(asset)
    await session.flush()

    try:
        text = extract_text(content, file.content_type)
    except Exception as exc:  # noqa: BLE001
        asset.status = "failed"
        asset.error = f"Could not extract text: {exc}"
        await session.flush()
        return asset

    if text.strip():
        from seoos.tools.brand_tools import index_asset_text

        asset.extracted_text = text[:2_000_000]
        asset.embedding_chunks = index_asset_text(text[:400_000])
        asset.summary = text.strip()[:600]
        asset.status = "indexed"
    else:
        asset.status = "extracted"
        asset.error = "No text found. Images are stored but cannot be searched."
    await session.flush()
    return asset


def extract_text(content: bytes, mime_type: str) -> str:
    """Pull text out of an upload.

    PDF and DOCX handling is optional: if the extra dependency is not
    installed the platform still accepts the file and says plainly that it
    could not read it, rather than failing the upload.
    """
    if mime_type in ("text/plain", "text/markdown", "text/csv"):
        return content.decode("utf-8", errors="replace")

    if mime_type == "application/pdf":
        try:
            import io

            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            return "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except ImportError:
            raise RuntimeError(
                "PDF text extraction needs the 'extract' extra: pip install 'seoos[extract]'"
            ) from None

    if mime_type.endswith("wordprocessingml.document"):
        try:
            import io

            import docx

            document = docx.Document(io.BytesIO(content))
            return "\n\n".join(p.text for p in document.paragraphs if p.text.strip())
        except ImportError:
            raise RuntimeError(
                "DOCX extraction needs the 'extract' extra: pip install 'seoos[extract]'"
            ) from None

    return ""


@router.get("/facts")
async def list_facts(site_id: str, tenant: Tenant, session: Session) -> dict:
    site = await get_site(session, tenant, site_id)
    rows = (
        await session.execute(
            select(BrandFact)
            .where(BrandFact.site_id == site.id)
            .order_by(BrandFact.category, BrandFact.created_at.desc())
        )
    ).scalars().all()
    now = datetime.now(UTC)
    return {
        "facts": [
            {
                "id": f.id,
                "statement": f.statement,
                "category": f.category,
                "source": f.source_ref,
                "source_type": f.source_type,
                "status": f.status,
                "confidence": f.confidence,
                "expires": f.valid_until,
                "expired": bool(
                    f.valid_until and f.valid_until.replace(tzinfo=UTC) < now
                ),
                "used": f.usage_count,
            }
            for f in rows
        ],
        "note": (
            "Writers may only state facts from this ledger or facts they cite to "
            "an external source. Anything not here will not be published."
        ),
    }


@router.post("/facts", status_code=status.HTTP_201_CREATED)
async def add_fact(
    site_id: str, payload: BrandFactIn, session: Session, tenant: TenantContext = require("editor")
) -> dict:
    site = await get_site(session, tenant, site_id)
    fact = BrandFact(
        org_id=tenant.org_id,
        site_id=site.id,
        statement=payload.statement,
        category=payload.category,
        source_type=payload.source_type,
        source_ref=payload.source_ref,
        valid_until=(
            datetime.combine(payload.valid_until, datetime.min.time(), tzinfo=UTC)
            if payload.valid_until else None
        ),
        confidence=1.0 if payload.source_type == "client_stated" else 0.85,
    )
    session.add(fact)
    await session.flush()
    return {"id": fact.id, "statement": fact.statement}


@router.delete("/facts/{fact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def retract_fact(
    site_id: str, fact_id: str, session: Session, tenant: TenantContext = require("editor")
) -> None:
    site = await get_site(session, tenant, site_id)
    fact = (
        await session.execute(
            select(BrandFact).where(BrandFact.id == fact_id, BrandFact.site_id == site.id)
        )
    ).scalar_one_or_none()
    if fact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fact not found")
    # Retracted rather than deleted: published pages may cite it, and knowing
    # a claim was withdrawn is more useful than the row disappearing.
    fact.status = "retracted"
    await session.flush()
