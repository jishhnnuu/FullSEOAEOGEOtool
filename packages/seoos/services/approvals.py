"""Approvals: the client's entire workload, and the executor behind it.

An approval stores the exact action to replay, so approving is deterministic:
the same tool, with the same arguments, executed under the same tenant. That
matters because the gap between "what I was shown" and "what happened" is
where trust in an autonomous system is lost.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from seoos.core.errors import Conflict, NotFound
from seoos.core.logging import get_logger
from seoos.core.models import Approval, Notification
from seoos.services.audit_log import record_event

log = get_logger("seoos.services.approvals")

DEFAULT_EXPIRY_DAYS = 21


class ApprovalsService:
    def __init__(self, session: AsyncSession, *, executor=None):
        self.session = session
        self.executor = executor  # ToolExecutor, injected to avoid a cycle

    async def create(
        self,
        *,
        ctx,
        approval_type: str,
        title: str,
        summary: str | None = None,
        action: dict[str, Any] | None = None,
        rationale: str | None = None,
        expected_impact: str | None = None,
        risk: str = "low",
        reversible: bool = True,
        rule: str | None = None,
        batch_key: str | None = None,
        preview: dict | None = None,
        diff: str | None = None,
        object_type: str | None = None,
        object_id: str | None = None,
        auto_approve_at: datetime | None = None,
    ) -> str:
        now = datetime.now(UTC)
        approval = Approval(
            org_id=ctx.org_id,
            site_id=ctx.site_id,
            type=approval_type,
            title=title[:500],
            summary=summary,
            rationale=rationale,
            expected_impact=expected_impact,
            risk=risk,
            reversible=reversible,
            action=action or {},
            preview=preview,
            diff=diff,
            object_type=object_type,
            object_id=object_id,
            requested_by_agent=ctx.agent_key,
            mission_run_id=ctx.mission_run_id,
            status="pending",
            policy_rule=rule,
            batch_key=batch_key,
            auto_approve_at=auto_approve_at,
            expires_at=now + timedelta(days=DEFAULT_EXPIRY_DAYS),
        )
        self.session.add(approval)
        await self.session.flush()

        # One notification per batch key per day, not one per item. A client
        # with forty pending alt-text fixes should get one message.
        await self._notify(approval)
        await record_event(
            self.session,
            org_id=ctx.org_id,
            site_id=ctx.site_id,
            action="approval.requested",
            object_type="approval",
            object_id=approval.id,
            actor_type="agent",
            actor_id=ctx.agent_key,
            summary=title,
            mission_run_id=ctx.mission_run_id,
        )
        log.info("approval %s requested: %s", approval.id, title[:80])
        return approval.id

    async def _notify(self, approval: Approval) -> None:
        digest_key = f"{approval.site_id}:{approval.batch_key or approval.type}:{datetime.now(UTC):%Y-%m-%d}"
        existing = (
            await self.session.execute(
                select(Notification).where(Notification.digest_key == digest_key)
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.data = {
                **(existing.data or {}),
                "count": int((existing.data or {}).get("count", 1)) + 1,
            }
            existing.title = (
                f"{existing.data['count']} items waiting for your approval"
            )
            return
        self.session.add(
            Notification(
                org_id=approval.org_id,
                site_id=approval.site_id,
                kind="approval_pending",
                severity="action_required" if approval.risk in ("high", "critical") else "info",
                title=approval.title[:400],
                body=approval.summary,
                link=f"/approvals/{approval.id}",
                data={"count": 1, "approval_id": approval.id, "risk": approval.risk},
                channels=["in_app"],
                digest_key=digest_key,
            )
        )

    async def decide(
        self,
        approval_id: str,
        *,
        decision: str,
        user_id: str | None = None,
        note: str | None = None,
        org_id: str | None = None,
    ) -> Approval:
        approval = await self._get(approval_id, org_id)
        if approval.status not in ("pending",):
            raise Conflict(f"Approval {approval_id} was already {approval.status}")
        if decision not in ("approved", "rejected", "changes_requested"):
            raise Conflict(f"Unknown decision {decision!r}")

        approval.status = decision
        approval.decided_by = user_id
        approval.decided_at = datetime.now(UTC)
        approval.decision_note = note
        await self.session.flush()

        await record_event(
            self.session,
            org_id=approval.org_id,
            site_id=approval.site_id,
            action=f"approval.{decision}",
            object_type="approval",
            object_id=approval.id,
            actor_type="user",
            actor_id=user_id,
            summary=approval.title,
        )
        if decision == "approved":
            await self.execute(approval)
        return approval

    async def execute(self, approval: Approval) -> Approval:
        """Replay the stored action. Idempotent: an already-executed approval
        is returned untouched rather than run twice."""
        if approval.executed_at is not None:
            return approval
        action = approval.action or {}
        tool_name = action.get("tool")
        if not tool_name:
            approval.status = "executed"
            approval.executed_at = datetime.now(UTC)
            approval.execution_result = {"note": "no executable action attached"}
            await self.session.flush()
            return approval

        if self.executor is None:
            approval.execution_error = "no executor wired; action not performed"
            await self.session.flush()
            log.error("approval %s approved but no executor is available", approval.id)
            return approval

        from seoos.tools.registry import ToolContext

        ctx = ToolContext(
            org_id=approval.org_id,
            site_id=approval.site_id,
            session=self.session,
            agent_key=approval.requested_by_agent,
            mission_run_id=approval.mission_run_id,
            autonomy="autopilot",  # the human just authorised this exact action
            extras={"approval_id": approval.id, "bypass_policy": True},
        )
        ctx.site = await self._load_site(approval.site_id)

        outcome = await self.executor.execute(tool_name, action.get("args") or {}, ctx)
        approval.executed_at = datetime.now(UTC)
        if outcome.ok:
            approval.status = "executed"
            approval.execution_result = {"summary": outcome.summary, "data": _trim(outcome.data)}
        else:
            approval.status = "failed"
            approval.execution_error = outcome.error
        await self.session.flush()
        await record_event(
            self.session,
            org_id=approval.org_id,
            site_id=approval.site_id,
            action="approval.executed" if outcome.ok else "approval.execution_failed",
            object_type="approval",
            object_id=approval.id,
            actor_type="system",
            summary=outcome.summary or outcome.error,
            reversible=approval.reversible,
        )
        return approval

    async def sweep_auto_approvals(self, *, limit: int = 100) -> int:
        """Standing instructions: low-risk items the client chose to let
        through after a waiting period. Run by the scheduler."""
        now = datetime.now(UTC)
        rows = (
            await self.session.execute(
                select(Approval)
                .where(
                    Approval.status == "pending",
                    Approval.auto_approve_at.is_not(None),
                    Approval.auto_approve_at <= now,
                )
                .limit(limit)
            )
        ).scalars().all()
        for approval in rows:
            approval.status = "auto_approved"
            approval.decided_at = now
            approval.decision_note = "Auto-approved under the site's standing instruction"
            await self.execute(approval)
        if rows:
            log.info("auto-approved %d items", len(rows))
        return len(rows)

    async def expire_stale(self) -> int:
        now = datetime.now(UTC)
        rows = (
            await self.session.execute(
                select(Approval).where(
                    Approval.status == "pending",
                    Approval.expires_at.is_not(None),
                    Approval.expires_at <= now,
                )
            )
        ).scalars().all()
        for approval in rows:
            approval.status = "expired"
        return len(rows)

    async def pending(self, site_id: str | None = None, org_id: str | None = None, limit: int = 50):
        stmt = select(Approval).where(Approval.status == "pending")
        if site_id:
            stmt = stmt.where(Approval.site_id == site_id)
        if org_id:
            stmt = stmt.where(Approval.org_id == org_id)
        stmt = stmt.order_by(Approval.created_at.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def _get(self, approval_id: str, org_id: str | None) -> Approval:
        stmt = select(Approval).where(Approval.id == approval_id)
        if org_id:
            stmt = stmt.where(Approval.org_id == org_id)
        approval = (await self.session.execute(stmt)).scalar_one_or_none()
        if approval is None:
            raise NotFound(f"Approval {approval_id} not found")
        return approval

    async def _load_site(self, site_id: str | None):
        if not site_id:
            return None
        from seoos.core.models import Site

        return (
            await self.session.execute(select(Site).where(Site.id == site_id))
        ).scalar_one_or_none()


def _trim(data: Any, limit: int = 4000) -> Any:
    text = str(data)
    if len(text) <= limit:
        return data
    return {"truncated": True, "preview": text[:limit]}
