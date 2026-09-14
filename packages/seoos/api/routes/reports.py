"""Reports, notifications and the public share link."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from seoos.api.schemas import NotificationOut, ReportOut
from seoos.api.security import Session, Tenant, get_site, require
from seoos.core.crypto import new_token
from seoos.core.db import TenantContext
from seoos.core.models import Notification, Report

router = APIRouter(tags=["reports"])


@router.get("/sites/{site_id}/reports", response_model=list[ReportOut])
async def list_reports(
    site_id: str, tenant: Tenant, session: Session, kind: str | None = None
) -> list[Report]:
    site = await get_site(session, tenant, site_id)
    stmt = select(Report).where(Report.site_id == site.id)
    if kind:
        stmt = stmt.where(Report.kind == kind)
    rows = (
        await session.execute(stmt.order_by(Report.created_at.desc()).limit(50))
    ).scalars().all()
    return list(rows)


@router.get("/sites/{site_id}/reports/live", response_model=ReportOut)
async def live_audit(site_id: str, tenant: Tenant, session: Session) -> Report:
    """The always-current audit. Rewritten by every audit mission."""
    site = await get_site(session, tenant, site_id)
    report = (
        await session.execute(
            select(Report).where(Report.site_id == site.id, Report.kind == "live_audit")
        )
    ).scalars().first()
    if report is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No audit yet. Run the onboarding or audit mission for this site.",
        )
    return report


@router.post("/reports/{report_id}/share")
async def share_report(
    report_id: str, session: Session, tenant: TenantContext = require("editor")
) -> dict:
    """Create a read-only link, so a client can send the report onward."""
    report = (
        await session.execute(
            select(Report).where(Report.id == report_id, Report.org_id == tenant.org_id)
        )
    ).scalar_one_or_none()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    from datetime import timedelta

    if not report.share_token:
        report.share_token = new_token(nbytes=18)
    report.share_expires_at = datetime.now(UTC) + timedelta(days=90)
    await session.flush()
    return {
        "share_token": report.share_token,
        "url": f"/shared/reports/{report.share_token}",
        "expires_at": report.share_expires_at,
    }


@router.delete("/reports/{report_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def unshare(report_id: str, session: Session, tenant: TenantContext = require("editor")) -> None:
    report = (
        await session.execute(
            select(Report).where(Report.id == report_id, Report.org_id == tenant.org_id)
        )
    ).scalar_one_or_none()
    if report is not None:
        report.share_token = None
        report.share_expires_at = None
        await session.flush()


# The shared route is deliberately outside the authenticated router: it is
# the one public surface, and it exposes only the report, never the site.
public_router = APIRouter(tags=["public"])


@public_router.get("/shared/reports/{token}")
async def shared_report(token: str) -> dict:
    from seoos.core.db import session_scope

    async with session_scope() as session:
        report = (
            await session.execute(select(Report).where(Report.share_token == token))
        ).scalar_one_or_none()
        if report is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "This link is not valid")
        if report.share_expires_at and report.share_expires_at < datetime.now(UTC):
            raise HTTPException(status.HTTP_410_GONE, "This link has expired")
        return {
            "title": report.title,
            "kind": report.kind,
            "period_start": report.period_start,
            "period_end": report.period_end,
            "narrative_md": report.narrative_md,
            "data": report.data,
            "generated_at": report.updated_at,
        }


@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    tenant: Tenant, session: Session, unread_only: bool = False, limit: int = 30
) -> list[Notification]:
    stmt = select(Notification).where(Notification.org_id == tenant.org_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = (
        await session.execute(
            stmt.order_by(Notification.created_at.desc()).limit(min(limit, 100))
        )
    ).scalars().all()
    return list(rows)


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(notification_id: str, tenant: Tenant, session: Session) -> None:
    row = (
        await session.execute(
            select(Notification).where(
                Notification.id == notification_id, Notification.org_id == tenant.org_id
            )
        )
    ).scalar_one_or_none()
    if row is not None and row.read_at is None:
        row.read_at = datetime.now(UTC)
        await session.flush()
