"""Content: the review queue and everything around it."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from seoos.api.schemas import ContentDetail, ContentOut, ContentReview
from seoos.api.security import Session, Tenant, require
from seoos.core.db import TenantContext
from seoos.core.errors import Conflict, NotFound
from seoos.core.models import ContentItem, ContentVersion
from seoos.services.audit_log import record_event
from seoos.services.content import ContentService

router = APIRouter(prefix="/content", tags=["content"])


@router.get("", response_model=list[ContentOut])
async def list_content(
    tenant: Tenant,
    session: Session,
    site_id: str | None = None,
    status_filter: str | None = None,
    limit: int = 50,
) -> list[ContentItem]:
    stmt = select(ContentItem).where(ContentItem.org_id == tenant.org_id)
    if site_id:
        stmt = stmt.where(ContentItem.site_id == site_id)
    if status_filter:
        stmt = stmt.where(ContentItem.status.in_(status_filter.split(",")))
    rows = (
        await session.execute(
            stmt.order_by(ContentItem.updated_at.desc()).limit(min(limit, 200))
        )
    ).scalars().all()
    return list(rows)


@router.get("/review-queue")
async def review_queue(tenant: Tenant, session: Session, site_id: str | None = None) -> dict:
    """What the client actually has to look at.

    Each item carries its gate results, so a reviewer can see that the
    automated checks already passed and their job is judging substance.
    """
    stmt = select(ContentItem).where(
        ContentItem.org_id == tenant.org_id, ContentItem.status == "review"
    )
    if site_id:
        stmt = stmt.where(ContentItem.site_id == site_id)
    rows = (await session.execute(stmt.order_by(ContentItem.updated_at))).scalars().all()

    return {
        "count": len(rows),
        "items": [
            {
                "id": item.id,
                "title": item.title,
                "type": item.type,
                "primary_keyword": item.primary_keyword,
                "word_count": item.word_count,
                "site_id": item.site_id,
                "scores": {
                    "quality": item.quality_score,
                    "brand": item.brand_score,
                    "aeo": item.aeo_score,
                    "reads_as_human": item.ai_pattern_score,
                },
                "all_gates_passed": not ContentService.failing_gates(item),
                "unverified_claims": item.unverified_claims,
                "meta_title": item.meta_title,
                "meta_description": item.meta_description,
                "waiting_since": item.updated_at,
            }
            for item in rows
        ],
    }


@router.get("/{content_id}", response_model=ContentDetail)
async def get_content(content_id: str, tenant: Tenant, session: Session) -> ContentItem:
    try:
        return await ContentService(session).get(content_id, org_id=tenant.org_id)
    except NotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, exc.message) from exc


@router.get("/{content_id}/versions")
async def versions(content_id: str, tenant: Tenant, session: Session) -> dict:
    """Every version, so the client can see exactly what they approved."""
    await ContentService(session).get(content_id, org_id=tenant.org_id)
    rows = (
        await session.execute(
            select(ContentVersion)
            .where(ContentVersion.content_id == content_id)
            .order_by(ContentVersion.version.desc())
        )
    ).scalars().all()
    return {
        "versions": [
            {
                "version": v.version, "stage": v.stage, "author": v.author,
                "title": v.title, "scores": v.scores, "is_live": v.is_live,
                "diff_summary": v.diff_summary, "created_at": v.created_at,
            }
            for v in rows
        ]
    }


@router.post("/{content_id}/review", response_model=ContentOut)
async def review(
    content_id: str,
    payload: ContentReview,
    session: Session,
    tenant: TenantContext = require("approver"),
) -> ContentItem:
    """The client's decision. This is the whole job the product asks of them."""
    service = ContentService(session)
    item = await service.get(content_id, org_id=tenant.org_id)
    if item.status != "review":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"'{item.title}' is at status '{item.status}', not awaiting review",
        )

    target = {
        "approve": "approved",
        "reject": "rejected",
        "request_changes": "changes_requested",
    }[payload.decision]

    try:
        item = await service.transition(
            content_id, target, author=tenant.user_id or "client", note=payload.note
        )
    except Conflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.message) from exc

    if payload.decision == "approve" and payload.schedule_for:
        item.scheduled_for = payload.schedule_for
        item.status = "scheduled"

    await record_event(
        session, org_id=tenant.org_id, site_id=item.site_id,
        action=f"content.{payload.decision}", object_type="content",
        object_id=item.id, actor_type="user", actor_id=tenant.user_id,
        summary=f"{payload.decision}: {item.title}", reversible=True,
    )
    await session.flush()
    return item


@router.patch("/{content_id}", response_model=ContentOut)
async def edit_content(
    content_id: str,
    payload: dict,
    session: Session,
    tenant: TenantContext = require("editor"),
) -> ContentItem:
    """Let a client edit a draft directly rather than only accept or reject.

    Most review friction is a sentence somebody wants changed. Forcing a full
    rejection cycle for that is why review queues stall.
    """
    service = ContentService(session)
    item = await service.get(content_id, org_id=tenant.org_id)
    editable = {"title", "body_markdown", "meta_title", "meta_description", "slug"}
    changed = []
    for field, value in payload.items():
        if field in editable and value is not None:
            setattr(item, field, value)
            changed.append(field)
    if "body_markdown" in changed:
        item.word_count = len((item.body_markdown or "").split())
    await service.snapshot(
        item, stage=item.status, author=tenant.user_id or "client",
        diff_summary=f"Client edited: {', '.join(changed)}",
    )
    await session.flush()
    return item
