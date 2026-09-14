"""Content lifecycle.

The state machine is explicit because the whole product promise hangs on it:
a client is asked to look at ``review`` and nothing else. Anything that would
put work in front of them before the automated gates have passed is a bug.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from seoos.core.errors import Conflict, NotFound
from seoos.core.logging import get_logger
from seoos.core.models import ContentItem, ContentVersion

log = get_logger("seoos.services.content")

# from -> allowed next states. Anything not listed is refused.
TRANSITIONS: dict[str, set[str]] = {
    "idea": {"briefed", "rejected", "archived"},
    "briefed": {"drafting", "idea", "rejected", "archived"},
    "drafting": {"editing", "briefed", "rejected"},
    "editing": {"qa", "drafting", "rejected"},
    "qa": {"review", "editing", "rejected"},
    "review": {"approved", "changes_requested", "rejected"},
    "changes_requested": {"drafting", "editing", "rejected", "archived"},
    "approved": {"scheduled", "publishing", "changes_requested"},
    "scheduled": {"publishing", "approved", "changes_requested"},
    "publishing": {"published", "approved"},
    "published": {"updating", "archived"},
    "updating": {"editing", "published"},
    "rejected": {"idea", "archived"},
    "archived": {"idea"},
}

# The gates that must pass before a draft is allowed in front of a human.
QA_THRESHOLDS = {
    "brand_score": 70.0,
    "quality_score": 70.0,
    "ai_pattern_score": 75.0,
    "readability_min": 35.0,
}


class ContentService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        org_id: str,
        site_id: str,
        title: str,
        content_type: str = "article",
        primary_keyword: str | None = None,
        cluster_id: str | None = None,
        created_by_agent: str | None = None,
        mission_run_id: str | None = None,
        **fields: Any,
    ) -> ContentItem:
        item = ContentItem(
            org_id=org_id,
            site_id=site_id,
            title=title[:600],
            type=content_type,
            primary_keyword=primary_keyword,
            cluster_id=cluster_id,
            created_by_agent=created_by_agent,
            mission_run_id=mission_run_id,
            slug=fields.pop("slug", None) or slugify(title),
            status="idea",
        )
        for key, value in fields.items():
            if hasattr(item, key) and value is not None:
                setattr(item, key, value)
        self.session.add(item)
        await self.session.flush()
        return item

    async def get(self, content_id: str, *, org_id: str | None = None) -> ContentItem:
        stmt = select(ContentItem).where(ContentItem.id == content_id)
        if org_id:
            stmt = stmt.where(ContentItem.org_id == org_id)
        item = (await self.session.execute(stmt)).scalar_one_or_none()
        if item is None:
            raise NotFound(f"Content item {content_id} not found")
        return item

    async def transition(
        self,
        content_id: str,
        new_status: str,
        *,
        author: str = "system",
        note: str | None = None,
        snapshot: bool = True,
        org_id: str | None = None,
    ) -> ContentItem:
        item = await self.get(content_id, org_id=org_id)
        allowed = TRANSITIONS.get(item.status, set())
        if new_status not in allowed:
            raise Conflict(
                f"Cannot move content from {item.status!r} to {new_status!r}. "
                f"Allowed: {', '.join(sorted(allowed)) or 'none'}"
            )
        if new_status == "review":
            failures = self.failing_gates(item)
            if failures:
                raise Conflict(
                    "Draft is not ready for human review; failing gates: "
                    + ", ".join(failures)
                )

        previous = item.status
        item.status = new_status
        if note:
            item.reviewer_notes = note
        if new_status == "changes_requested":
            item.revision_count += 1
        if new_status == "published":
            item.published_at = datetime.now(UTC)

        if snapshot:
            await self.snapshot(item, stage=new_status, author=author)
        await self.session.flush()
        log.info("content %s: %s -> %s", content_id, previous, new_status)
        return item

    async def snapshot(
        self, item: ContentItem, *, stage: str, author: str, diff_summary: str | None = None
    ) -> ContentVersion:
        item.version += 1
        version = ContentVersion(
            org_id=item.org_id,
            content_id=item.id,
            version=item.version,
            stage=stage,
            author=author,
            title=item.title,
            body_markdown=item.body_markdown,
            front_matter=item.front_matter or {},
            diff_summary=diff_summary,
            scores={
                "brand": item.brand_score,
                "quality": item.quality_score,
                "aeo": item.aeo_score,
                "readability": item.readability_score,
                "ai_pattern": item.ai_pattern_score,
            },
            is_live=stage == "published",
        )
        self.session.add(version)
        await self.session.flush()
        return version

    @staticmethod
    def failing_gates(item: ContentItem) -> list[str]:
        """Which automated checks would embarrass us in front of the client."""
        failures: list[str] = []
        if not item.body_markdown or len((item.body_markdown or "").split()) < 120:
            failures.append("body is empty or far too short")
        if item.brand_score is not None and item.brand_score < QA_THRESHOLDS["brand_score"]:
            failures.append(f"brand voice {item.brand_score:.0f} below {QA_THRESHOLDS['brand_score']:.0f}")
        if item.quality_score is not None and item.quality_score < QA_THRESHOLDS["quality_score"]:
            failures.append(f"quality {item.quality_score:.0f} below {QA_THRESHOLDS['quality_score']:.0f}")
        if (
            item.ai_pattern_score is not None
            and item.ai_pattern_score < QA_THRESHOLDS["ai_pattern_score"]
        ):
            failures.append(
                f"machine-writing tells: score {item.ai_pattern_score:.0f} below "
                f"{QA_THRESHOLDS['ai_pattern_score']:.0f}"
            )
        if item.unverified_claims:
            failures.append(f"{len(item.unverified_claims)} unverified factual claims")
        if not item.meta_title or not item.meta_description:
            failures.append("missing meta title or description")
        return failures

    async def queue(
        self,
        site_id: str,
        *,
        statuses: list[str] | None = None,
        limit: int = 50,
    ) -> list[ContentItem]:
        stmt = select(ContentItem).where(ContentItem.site_id == site_id)
        if statuses:
            stmt = stmt.where(ContentItem.status.in_(statuses))
        stmt = stmt.order_by(
            ContentItem.priority_score.desc().nullslast(), ContentItem.created_at.desc()
        ).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def due_for_publish(self, site_id: str) -> list[ContentItem]:
        now = datetime.now(UTC)
        stmt = select(ContentItem).where(
            ContentItem.site_id == site_id,
            ContentItem.status.in_(["approved", "scheduled"]),
            (ContentItem.scheduled_for.is_(None)) | (ContentItem.scheduled_for <= now),
        )
        return list((await self.session.execute(stmt)).scalars().all())


_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(text: str, *, max_length: int = 70) -> str:
    slug = _SLUG_STRIP.sub("-", (text or "").lower()).strip("-")
    if len(slug) <= max_length:
        return slug
    # Cut on a word boundary rather than mid-word, which reads as a typo.
    cut = slug[:max_length]
    return cut.rsplit("-", 1)[0] if "-" in cut else cut
