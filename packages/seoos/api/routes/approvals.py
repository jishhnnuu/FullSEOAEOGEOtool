"""Approvals: the client's inbox, and the only thing they must do."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from seoos.api.schemas import ApprovalDecision, ApprovalOut, BulkApproval
from seoos.api.security import Session, Tenant, require
from seoos.core.db import TenantContext
from seoos.core.errors import Conflict, NotFound
from seoos.core.models import Approval
from seoos.services.approvals import ApprovalsService
from seoos.tools import load_all_tools
from seoos.tools.registry import ToolExecutor

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _service(session) -> ApprovalsService:
    service = ApprovalsService(session)
    service.executor = ToolExecutor(load_all_tools())
    return service


@router.get("", response_model=list[ApprovalOut])
async def list_approvals(
    tenant: Tenant,
    session: Session,
    site_id: str | None = None,
    status_filter: str = "pending",
    limit: int = 50,
) -> list[Approval]:
    stmt = select(Approval).where(Approval.org_id == tenant.org_id)
    if status_filter != "all":
        stmt = stmt.where(Approval.status == status_filter)
    if site_id:
        stmt = stmt.where(Approval.site_id == site_id)
    rows = (
        await session.execute(
            stmt.order_by(Approval.created_at.desc()).limit(min(limit, 200))
        )
    ).scalars().all()
    return list(rows)


@router.get("/grouped")
async def grouped(tenant: Tenant, session: Session, site_id: str | None = None) -> dict:
    """Pending approvals batched the way the client should act on them.

    Forty alt-text fixes are one decision, not forty. Presenting them
    individually is what trains people to click approve without reading.
    """
    stmt = select(Approval).where(
        Approval.org_id == tenant.org_id, Approval.status == "pending"
    )
    if site_id:
        stmt = stmt.where(Approval.site_id == site_id)
    rows = (await session.execute(stmt.order_by(Approval.created_at))).scalars().all()

    batches: dict[str, dict] = {}
    for approval in rows:
        key = approval.batch_key or approval.type
        batch = batches.setdefault(
            key,
            {
                "key": key,
                "type": approval.type,
                "risk": approval.risk,
                "count": 0,
                "reversible": True,
                "items": [],
                "can_bulk_approve": approval.risk in ("low", "medium"),
            },
        )
        batch["count"] += 1
        batch["reversible"] = batch["reversible"] and approval.reversible
        # Risk of a batch is the risk of its riskiest member.
        order = ["low", "medium", "high", "critical"]
        if order.index(approval.risk) > order.index(batch["risk"]):
            batch["risk"] = approval.risk
            batch["can_bulk_approve"] = approval.risk in ("low", "medium")
        if len(batch["items"]) < 25:
            batch["items"].append(ApprovalOut.model_validate(approval).model_dump())

    ordered = sorted(
        batches.values(),
        key=lambda b: (["critical", "high", "medium", "low"].index(b["risk"]), -b["count"]),
    )
    return {"batches": ordered, "total_pending": len(rows)}


@router.get("/{approval_id}", response_model=ApprovalOut)
async def get_approval(approval_id: str, tenant: Tenant, session: Session) -> Approval:
    approval = (
        await session.execute(
            select(Approval).where(
                Approval.id == approval_id, Approval.org_id == tenant.org_id
            )
        )
    ).scalar_one_or_none()
    if approval is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approval not found")
    return approval


@router.post("/{approval_id}/decide", response_model=ApprovalOut)
async def decide(
    approval_id: str,
    payload: ApprovalDecision,
    session: Session,
    tenant: TenantContext = require("approver"),
) -> Approval:
    try:
        return await _service(session).decide(
            approval_id,
            decision=payload.decision,
            user_id=tenant.user_id,
            note=payload.note,
            org_id=tenant.org_id,
        )
    except NotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, exc.message) from exc
    except Conflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, exc.message) from exc


@router.post("/bulk")
async def bulk_decide(
    payload: BulkApproval, session: Session, tenant: TenantContext = require("approver")
) -> dict:
    """Decide a batch at once.

    High and critical risk items are excluded even when they appear in the
    list: those must be looked at individually, and a bulk endpoint that
    lets one click ship a critical change is a design failure.
    """
    service = _service(session)
    results: dict[str, str] = {}
    skipped: list[dict] = []

    for approval_id in payload.approval_ids[:200]:
        approval = (
            await session.execute(
                select(Approval).where(
                    Approval.id == approval_id, Approval.org_id == tenant.org_id
                )
            )
        ).scalar_one_or_none()
        if approval is None:
            results[approval_id] = "not_found"
            continue
        if approval.risk in ("high", "critical") and payload.decision == "approved":
            skipped.append(
                {
                    "id": approval_id,
                    "title": approval.title,
                    "reason": f"{approval.risk} risk items must be approved individually",
                }
            )
            continue
        try:
            await service.decide(
                approval_id,
                decision=payload.decision,
                user_id=tenant.user_id,
                note=payload.note,
                org_id=tenant.org_id,
            )
            results[approval_id] = "ok"
        except (NotFound, Conflict) as exc:
            results[approval_id] = exc.message

    return {
        "decided": sum(1 for v in results.values() if v == "ok"),
        "results": results,
        "skipped": skipped,
    }
