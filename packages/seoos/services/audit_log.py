"""Audit logging. Every state change, attributable and reversible."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from seoos.core.models import AuditLog


async def record_event(
    session: AsyncSession,
    *,
    org_id: str,
    action: str,
    object_type: str,
    object_id: str | None = None,
    site_id: str | None = None,
    actor_type: str = "agent",
    actor_id: str | None = None,
    summary: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reversible: bool = False,
    mission_run_id: str | None = None,
    severity: int = 0,
    ip: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        org_id=org_id,
        site_id=site_id,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        summary=summary,
        before=before,
        after=after,
        reversible=reversible,
        mission_run_id=mission_run_id,
        severity=severity,
        ip=ip,
    )
    session.add(entry)
    await session.flush()
    return entry
