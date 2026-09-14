"""Persisting findings.

Reconciliation rather than replacement. Re-creating findings on every crawl
would destroy the one thing a client actually wants to see: whether the list
is getting shorter. So each audit updates ``last_seen_at`` on what is still
there, closes what has gone, and reopens anything that came back.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from seoos.analysis.findings import FindingDraft
from seoos.core.logging import get_logger
from seoos.core.models import Finding

log = get_logger("seoos.services.findings")


@dataclass
class ReconcileResult:
    created: int = 0
    updated: int = 0
    resolved: int = 0
    regressed: int = 0

    def to_dict(self) -> dict:
        return {
            "created": self.created,
            "updated": self.updated,
            "resolved": self.resolved,
            "regressed": self.regressed,
        }


class FindingsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def reconcile(
        self,
        *,
        org_id: str,
        site_id: str,
        drafts: list[FindingDraft],
        crawl_id: str | None = None,
        categories: list[str] | None = None,
    ) -> ReconcileResult:
        """Merge a fresh set of drafts into the stored findings.

        ``categories`` scopes the close-out: a content-only run must not close
        technical findings it never looked for.
        """
        now = datetime.now(UTC)
        result = ReconcileResult()

        existing_rows = (
            await self.session.execute(
                select(Finding).where(Finding.site_id == site_id)
            )
        ).scalars().all()
        by_fingerprint = {row.fingerprint: row for row in existing_rows}
        seen: set[str] = set()

        for draft in drafts:
            fingerprint = draft.fingerprint()
            seen.add(fingerprint)
            row = by_fingerprint.get(fingerprint)
            definition = draft.definition

            if row is None:
                self.session.add(
                    Finding(
                        org_id=org_id,
                        site_id=site_id,
                        fingerprint=fingerprint,
                        code=draft.code,
                        category=draft.category,
                        severity=draft.severity,
                        title=definition.title,
                        detail=draft.detail,
                        recommendation=definition.recommendation,
                        url=draft.url,
                        affected_urls=draft.affected_urls[:500],
                        affected_count=len(draft.affected_urls) or 1,
                        evidence=draft.evidence,
                        impact=draft.impact,
                        effort=definition.effort,
                        confidence=definition.confidence,
                        priority_score=draft.priority_score(),
                        auto_fixable=definition.auto_fixable,
                        fix_strategy=definition.fix_strategy,
                        fix_payload=draft.auto_fix_payload,
                        status="open",
                        found_by=draft.found_by,
                        crawl_id=crawl_id,
                        first_seen_at=now,
                        last_seen_at=now,
                    )
                )
                result.created += 1
                continue

            was_closed = row.status in ("fixed", "verified", "wont_fix", "accepted_risk")
            if was_closed and row.status != "wont_fix":
                row.status = "regressed"
                row.regression_count += 1
                result.regressed += 1
            elif row.status not in ("wont_fix", "accepted_risk"):
                row.status = row.status if row.status != "regressed" else "open"
                result.updated += 1

            row.detail = draft.detail or row.detail
            row.evidence = draft.evidence or row.evidence
            row.affected_urls = draft.affected_urls[:500] or row.affected_urls
            row.affected_count = len(draft.affected_urls) or 1
            row.severity = draft.severity
            row.priority_score = draft.priority_score(row.confidence)
            row.fix_payload = draft.auto_fix_payload or row.fix_payload
            row.last_seen_at = now
            row.crawl_id = crawl_id or row.crawl_id

        # Close what the fresh scan no longer sees, inside the scanned scope.
        for fingerprint, row in by_fingerprint.items():
            if fingerprint in seen:
                continue
            if row.status in ("fixed", "verified", "wont_fix", "accepted_risk"):
                continue
            if categories and row.category not in categories:
                continue
            row.status = "fixed"
            row.resolved_at = now
            result.resolved += 1

        await self.session.flush()
        log.info("findings reconciled for %s: %s", site_id, result.to_dict())
        return result

    async def open_findings(
        self,
        site_id: str,
        *,
        categories: list[str] | None = None,
        severities: list[str] | None = None,
        auto_fixable: bool | None = None,
        limit: int = 100,
    ) -> list[Finding]:
        stmt = select(Finding).where(
            Finding.site_id == site_id,
            Finding.status.in_(["open", "regressed", "in_progress"]),
        )
        if categories:
            stmt = stmt.where(Finding.category.in_(categories))
        if severities:
            stmt = stmt.where(Finding.severity.in_(severities))
        if auto_fixable is not None:
            stmt = stmt.where(Finding.auto_fixable == auto_fixable)
        stmt = stmt.order_by(Finding.priority_score.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def mark(self, finding_id: str, status: str, *, note: str | None = None) -> Finding | None:
        row = (
            await self.session.execute(select(Finding).where(Finding.id == finding_id))
        ).scalar_one_or_none()
        if row is None:
            return None
        row.status = status
        if status in ("fixed", "verified"):
            row.resolved_at = datetime.now(UTC)
        if status == "verified":
            row.verified_at = datetime.now(UTC)
        if note:
            row.detail = f"{row.detail or ''}\n\n{note}".strip()
        await self.session.flush()
        return row
