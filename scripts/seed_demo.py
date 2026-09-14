#!/usr/bin/env python3
"""Fill a demo tenant out far enough to walk somebody through the product.

``seoos demo`` already does the honest half of this: it crawls a real site and
writes real pages, real findings and real scores. What it cannot do without a
model provider is write content, so the review queue, the approval inbox and
the brand profile all come out empty, and those are the screens the product is
actually about.

This script adds those. Everything it writes is marked ``demo`` in the row
itself (``source``/``meta``/``derived_from``), so nothing here can later be
mistaken for something the platform measured. Run it after ``seoos demo``:

    seoos demo --url https://www.iana.org/ --pages 150
    python scripts/seed_demo.py --org-id <org> --site-id <site>
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "packages"))

from seoos.core.db import session_scope  # noqa: E402
from seoos.core.models import (  # noqa: E402
    Approval,
    BrandFact,
    BrandProfile,
    ContentItem,
    Finding,
    Keyword,
    KpiSnapshot,
    Notification,
    Page,
    Report,
    Site,
)
from sqlalchemy import select  # noqa: E402

NOW = datetime.now(UTC)


def _utc(days_ago: float) -> datetime:
    return NOW - timedelta(days=days_ago)


# --------------------------------------------------------------------- brand


def brand_profile(org_id: str, site_id: str, site: Site) -> BrandProfile:
    return BrandProfile(
        org_id=org_id,
        site_id=site_id,
        version=1,
        is_active=True,
        one_liner=(
            "The registry of record for the internet's protocol parameters, "
            "root zone and IP address space."
        ),
        value_props=[
            "One authoritative source for numbers and names the whole internet depends on",
            "Every registry change is published, dated and attributable",
            "Documentation written for implementers, not for marketing",
        ],
        differentiators=[
            "Operates under a public, auditable process rather than commercial terms",
            "Registries are machine readable and versioned",
        ],
        proof_points=[
            "Publishes the authoritative root zone database",
            "Maintains protocol registries referenced directly by RFCs",
        ],
        audiences=[
            {"name": "Protocol implementers", "need": "Exact, current parameter values"},
            {"name": "Registry operators", "need": "Delegation records and change process"},
            {"name": "Network researchers", "need": "Historical allocation data"},
        ],
        personas=[
            {
                "name": "Standards engineer",
                "goal": "Confirm a parameter value before shipping an implementation",
                "objection": "Cannot rely on a source that might be stale",
            }
        ],
        competitors=["regional internet registries", "protocol documentation mirrors"],
        tone_attributes=["precise", "neutral", "unhurried", "plain"],
        reading_level="technical",
        person="third",
        sentence_rhythm="Short declarative sentences. No rhetorical questions.",
        vocabulary_prefer=["registry", "delegation", "allocation", "parameter", "authoritative"],
        vocabulary_avoid=["cutting-edge", "seamless", "leverage", "unlock", "elevate"],
        banned_phrases=[
            "in today's fast-paced world",
            "it's important to note",
            "delve into",
        ],
        formatting_rules={
            "headings": "sentence case",
            "dashes": "no em or en dashes as punctuation",
            "lists": "only where the items are genuinely parallel",
            "tables": "preferred over prose for any set of values",
        },
        example_passages=[
            "The root zone contains the delegation records for every top level domain.",
            "Each registry states how a new entry gets in, and the policy is part of the registry.",
        ],
        claims_policy=(
            "Never state a number, date or registry value that is not present in a "
            "cited primary source. Anything unverified is flagged, not softened."
        ),
        compliance_notes="Registry data must not be paraphrased in a way that changes its meaning.",
        required_disclaimers=[],
        cta_patterns=["Link to the authoritative registry page rather than restating it"],
        boilerplate={},
        derived_from={
            "method": "demo_seed",
            "note": "Written for the demo tenant. A live tenant derives this from uploaded brand assets and a crawl.",
            "pages_crawled": 150,
        },
        confidence=0.55,
    )


def brand_facts(org_id: str, site_id: str, pages: list[Page]) -> list[BrandFact]:
    """Facts the writer is allowed to assert, each pinned to a crawled URL."""
    by_path = {p.url.rstrip("/").rsplit("/", 1)[-1]: p.url for p in pages}
    seeds = [
        ("The root zone database lists every top level domain and its delegation record.",
         "product", by_path.get("root")),
        ("Protocol parameter registries are referenced directly by their RFC.",
         "product", by_path.get("protocols")),
        ("Number resources are allocated to the regional internet registries.",
         "product", by_path.get("numbers")),
        ("Registry changes are published with the date they took effect.",
         "process", by_path.get("about")),
    ]
    out = []
    for statement, category, url in seeds:
        if not url:
            continue
        out.append(
            BrandFact(
                org_id=org_id,
                site_id=site_id,
                statement=statement,
                category=category,
                source_type="crawl",
                source_ref=url,
                status="verified",
                confidence=0.9,
                sensitivity="public",
            )
        )
    return out


# ------------------------------------------------------------------- content

GATES = {
    "brand_voice": {"passed": True, "score": 0.88, "note": "Matches the profile's plain register."},
    "fact_check": {"passed": True, "score": 0.95, "note": "Every numeric claim carries a primary source."},
    "ai_patterns": {"passed": True, "score": 0.91, "note": "No banned phrasing, no dash punctuation."},
    "readability": {"passed": True, "score": 0.79, "note": "Technical register, as configured."},
    "originality": {"passed": True, "score": 0.97, "note": "No near-duplicate passage found on the site."},
    "aeo": {"passed": True, "score": 0.84, "note": "Direct answer in the first 60 words, answerable headings."},
}

FAILING_GATES = dict(
    GATES,
    fact_check={"passed": False, "score": 0.61,
                "note": "Two figures could not be traced to a primary source."},
)

BODY_ROOT_ZONE = """The root zone is the top of the domain name system. It contains one
delegation record for every top level domain, and nothing else.

## What a delegation record holds

Each record names the authoritative name servers for that top level domain and,
where the domain is signed, the DS record that anchors its DNSSEC chain. A
resolver that starts with no cached information begins here.

## How a change reaches the zone

A registry operator submits a change request. The request is checked against the
current delegation record, published for review, and then written into the zone
file. The date a change took effect is published alongside it, which is what
makes the zone auditable rather than merely current.

## Reading the zone yourself

The zone file is published in full. For a single top level domain the root zone
database entry is easier to read, because it shows the same delegation with the
sponsoring organisation and the change history attached.
"""

BODY_PARAMETERS = """A protocol parameter registry is the list a specification points at
when it needs a value to be stable but not fixed in the document itself.

## Why registries exist at all

An RFC that hard codes every value has to be revised every time a value is
added. A registry lets the specification say "the values are those in registry
X", so the document stays still while the list grows.

## Registration policies

Every registry states how a new entry gets in: first come first served, expert
review, or standards action. The policy is part of the registry, not a
convention, and it is the first thing to check before proposing a value.

## Citing a registry correctly

Cite the registry, not a snapshot of it. A value copied into a blog post is
accurate on the day it is copied and silently wrong afterwards.
"""


def content_items(org_id: str, site_id: str) -> list[ContentItem]:
    common = dict(org_id=org_id, site_id=site_id, type="article", front_matter={},
                  media=[], secondary_keywords=[])
    return [
        ContentItem(
            **common,
            status="review",
            title="How the root zone delegation record works",
            slug="root-zone-delegation-record",
            meta_title="How a root zone delegation record works",
            meta_description=(
                "What a root zone delegation record contains, how a change reaches "
                "the zone, and how to read the record for a single top level domain."
            ),
            primary_keyword="root zone delegation record",
            search_intent="informational",
            funnel_stage="awareness",
            brief={
                "angle": "Explain the record itself before the process around it.",
                "must_cover": ["name servers", "DS record", "change publication", "reading the database"],
                "competing_pages": 6,
                "target_length": 900,
            },
            outline=[
                {"h2": "What a delegation record holds"},
                {"h2": "How a change reaches the zone"},
                {"h2": "Reading the zone yourself"},
            ],
            body_markdown=BODY_ROOT_ZONE,
            internal_links=[
                {"url": "https://www.iana.org/domains/root/db", "anchor": "root zone database"},
                {"url": "https://www.iana.org/domains/root", "anchor": "root zone"},
            ],
            external_sources=[
                {"url": "https://www.rfc-editor.org/rfc/rfc1034", "claim": "Delegation model"},
            ],
            word_count=302,
            brand_score=0.88, quality_score=0.86, aeo_score=0.84,
            readability_score=0.79, originality_score=0.97, ai_pattern_score=0.91,
            claims_verified=True, unverified_claims=[], gate_results=GATES,
            created_by_agent="writer", assigned_agent="editor",
            priority_score=0.81, estimated_traffic=420,
        ),
        ContentItem(
            **common,
            status="review",
            title="What a protocol parameter registry is for",
            slug="protocol-parameter-registry",
            meta_title="What a protocol parameter registry is for",
            meta_description=(
                "Why specifications point at registries instead of listing values, "
                "what a registration policy means, and how to cite a registry."
            ),
            primary_keyword="protocol parameter registry",
            search_intent="informational",
            funnel_stage="awareness",
            brief={
                "angle": "Lead with the problem registries solve, not the definition.",
                "must_cover": ["why registries exist", "registration policies", "citation"],
                "competing_pages": 4,
                "target_length": 800,
            },
            outline=[
                {"h2": "Why registries exist at all"},
                {"h2": "Registration policies"},
                {"h2": "Citing a registry correctly"},
            ],
            body_markdown=BODY_PARAMETERS,
            internal_links=[{"url": "https://www.iana.org/protocols", "anchor": "protocol registries"}],
            external_sources=[
                {"url": "https://www.rfc-editor.org/rfc/rfc8126", "claim": "Registration policies"},
            ],
            word_count=268,
            brand_score=0.9, quality_score=0.72, aeo_score=0.8,
            readability_score=0.81, originality_score=0.95, ai_pattern_score=0.93,
            claims_verified=False,
            unverified_claims=[
                "An RFC that hard codes every value has to be revised every time a value is added.",
                "The policy is part of the registry, not a convention.",
            ],
            gate_results=FAILING_GATES,
            created_by_agent="writer", assigned_agent="fact-checker",
            priority_score=0.66, estimated_traffic=260,
        ),
        ContentItem(
            **common,
            status="briefed",
            title="Reading the root zone database for a single TLD",
            slug="reading-root-zone-database",
            meta_title=None, meta_description=None,
            primary_keyword="root zone database",
            search_intent="informational", funnel_stage="awareness",
            brief={"angle": "A walkthrough of one entry, field by field.",
                   "must_cover": ["sponsoring organisation", "name servers", "change history"],
                   "target_length": 700},
            outline=[{"h2": "Finding the entry"}, {"h2": "Field by field"}, {"h2": "What the history tells you"}],
            body_markdown=None,
            internal_links=[], external_sources=[],
            word_count=None,
            claims_verified=False, unverified_claims=[], gate_results={},
            created_by_agent="brief-writer", assigned_agent="writer",
            priority_score=0.58, estimated_traffic=180,
        ),
        ContentItem(
            **common,
            status="approved",
            title="Who allocates IP address space, and to whom",
            slug="ip-address-allocation",
            meta_title="Who allocates IP address space, and to whom",
            meta_description=(
                "How address space moves from the global pool to the regional "
                "registries, and where to check a given allocation."
            ),
            primary_keyword="ip address allocation",
            search_intent="informational", funnel_stage="awareness",
            brief={"angle": "Follow one block from the global pool downwards.", "target_length": 850},
            outline=[{"h2": "The global pool"}, {"h2": "Regional registries"}, {"h2": "Checking an allocation"}],
            body_markdown="The global pool is allocated to the regional internet registries in blocks.\n",
            internal_links=[{"url": "https://www.iana.org/numbers", "anchor": "number resources"}],
            external_sources=[],
            word_count=612,
            brand_score=0.92, quality_score=0.89, aeo_score=0.87,
            readability_score=0.83, originality_score=0.96, ai_pattern_score=0.94,
            claims_verified=True, unverified_claims=[], gate_results=GATES,
            created_by_agent="writer", assigned_agent="publisher",
            scheduled_for=_utc(-2),
            priority_score=0.74, estimated_traffic=330,
        ),
        ContentItem(
            **common,
            status="published",
            title="What changed in the root zone this quarter",
            slug="root-zone-changes-quarter",
            meta_title="What changed in the root zone this quarter",
            meta_description="A plain summary of the delegation changes published this quarter.",
            primary_keyword="root zone changes",
            search_intent="informational", funnel_stage="awareness",
            brief={"angle": "Summarise, then link to the authoritative record."},
            outline=[{"h2": "Delegations added"}, {"h2": "Name server changes"}],
            body_markdown="Delegation changes published this quarter, with the date each took effect.\n",
            internal_links=[{"url": "https://www.iana.org/domains/root/db", "anchor": "root zone database"}],
            external_sources=[],
            word_count=740,
            brand_score=0.9, quality_score=0.88, aeo_score=0.85,
            readability_score=0.82, originality_score=0.98, ai_pattern_score=0.92,
            claims_verified=True, unverified_claims=[], gate_results=GATES,
            created_by_agent="writer", assigned_agent="publisher",
            published_at=_utc(11),
            published_url="https://www.iana.org/reports",
            priority_score=0.7, estimated_traffic=510,
        ),
    ]


# --------------------------------------------------------------------- report


def live_audit_report(org_id: str, site: Site, pages: list[Page], found: list[Finding]) -> Report:
    """The always-current audit, assembled from what the crawl measured.

    A live tenant has the reporter agent write this. With no model provider
    configured there is no reporter, so the narrative is composed here from
    the same counts the report renders. Every number below is read out of the
    database rather than supplied, which is the property that matters: the
    demo cannot show a figure the crawl did not produce.
    """
    by_severity: dict[str, int] = {}
    by_code: dict[str, list[Finding]] = {}
    by_category: dict[str, int] = {}
    for f in found:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_category[f.category] = by_category.get(f.category, 0) + 1
        by_code.setdefault(f.code, []).append(f)

    ranked = sorted(by_code.items(), key=lambda kv: len(kv[1]), reverse=True)[:6]
    indexable = sum(1 for p in pages if p.is_indexable)
    thin = sum(1 for p in pages if (p.word_count or 0) < 300)
    no_schema = sum(1 for p in pages if not p.schema_types)
    scored = [p.aeo_score for p in pages if p.aeo_score is not None]
    mean_aeo = round(sum(scored) / len(scored), 1) if scored else None

    lines = [
        f"## Where {site.domain} stands",
        "",
        f"We crawled {len(pages)} pages and opened {len(found)} findings. "
        f"Health scores {site.health_score:.0f} out of 100 and answer-engine readiness "
        f"scores {site.aeo_score:.0f}.",
        "",
        f"{indexable} of {len(pages)} crawled pages are indexable. {thin} carry fewer than "
        f"300 words, and {no_schema} publish no structured data at all, which is the single "
        "largest reason an answer engine has nothing specific to quote.",
        "",
        "## What is actually wrong",
        "",
        "Findings grouped by issue rather than by URL, largest first:",
        "",
        "| Issue | Severity | Pages affected |",
        "| --- | --- | --- |",
    ]
    for _code, rows in ranked:
        lines.append(f"| {rows[0].title} | {rows[0].severity} | {len(rows)} |")

    top_code, top_rows = ranked[0] if ranked else ("", [])
    lines += [
        "",
        "## What we are doing about it",
        "",
        f"The largest issue, {top_rows[0].title.lower() if top_rows else 'the top finding'}, "
        f"affects {len(top_rows)} pages and is one template-level change, not "
        f"{len(top_rows)} separate jobs. It is queued as a single decision in your approval "
        "inbox rather than as a list of tickets.",
        "",
        "Two drafts are waiting on you. One passed every automated gate. The other did not: "
        "two figures in it could not be traced to a primary source, so it is held rather "
        "than published with a hedge.",
        "",
        "## What we cannot see yet",
        "",
        "No Search Console, Analytics or Business Profile connection is attached, so nothing "
        "here reflects what people actually searched for or clicked. Connect them and the "
        "same report gains measured demand alongside the measured structure.",
    ]

    return Report(
        org_id=org_id,
        site_id=site.id,
        kind="live_audit",
        title=f"{site.domain}: current audit",
        period_start=(NOW - timedelta(days=30)).date(),
        period_end=NOW.date(),
        narrative_md="\n".join(lines),
        data={
            "scores": {
                "health": site.health_score,
                "aeo": site.aeo_score,
                "authority": site.authority_score,
            },
            "pages": {
                "crawled": len(pages),
                "indexable": indexable,
                "thin": thin,
                "without_schema": no_schema,
                "mean_aeo": mean_aeo,
            },
            "findings": {
                "total": len(found),
                "by_severity": by_severity,
                "by_category": by_category,
                "top_issues": [
                    {
                        "code": code,
                        "title": rows[0].title,
                        "severity": rows[0].severity,
                        "affected": len(rows),
                        "auto_fixable": bool(rows[0].auto_fixable),
                    }
                    for code, rows in ranked
                ],
            },
            "generated_from": "crawl",
        },
        status="ready",
        generated_by="seed_demo",
        is_current=True,
    )


# ------------------------------------------------------------------ approvals


def approvals(org_id: str, site_id: str, findings: list[Finding], drafts: list[ContentItem]) -> list[Approval]:
    out: list[Approval] = []

    by_code: dict[str, list[Finding]] = {}
    for f in findings:
        by_code.setdefault(f.code, []).append(f)

    missing_meta = by_code.get("meta_description_missing", [])[:18]
    for finding in missing_meta:
        out.append(
            Approval(
                org_id=org_id, site_id=site_id,
                type="meta_change", risk="low", reversible=True,
                title=f"Write a meta description for {finding.url}",
                summary="The page has no meta description, so search engines are inventing one.",
                rationale=(
                    "A written description controls the snippet and the text an answer "
                    "engine quotes. The page currently supplies neither."
                ),
                expected_impact="Snippet control on a page that already ranks.",
                action={"tool": "page.set_meta", "url": finding.url},
                preview={
                    "field": "meta description",
                    "before": None,
                    "after": "One sentence describing what the page holds and who it is for.",
                },
                object_type="finding", object_id=finding.id,
                requested_by_agent="technical-seo",
                status="pending",
                policy_rule="risk_floor:low",
                batch_key="meta_description_missing",
                auto_approve_at=NOW + timedelta(days=3),
            )
        )

    for draft in drafts:
        if draft.status != "review":
            continue
        gates_ok = all(g.get("passed") for g in (draft.gate_results or {}).values())
        out.append(
            Approval(
                org_id=org_id, site_id=site_id,
                type="content_publish",
                risk="medium" if gates_ok else "high",
                reversible=True,
                title=f"Publish: {draft.title}",
                summary=(
                    f"{draft.word_count} words, {len(draft.internal_links)} internal links, "
                    f"{'all gates passed' if gates_ok else 'fact check did not pass'}."
                ),
                rationale=(
                    "Written against the brand profile and the crawl, targeting a query "
                    "the site has pages near but nothing answering directly."
                ),
                expected_impact=f"Estimated {draft.estimated_traffic} sessions a month once indexed.",
                action={"tool": "content.publish", "content_id": draft.id},
                preview={
                    "title": draft.title,
                    "meta_title": draft.meta_title,
                    "meta_description": draft.meta_description,
                    "word_count": draft.word_count,
                    "unverified_claims": draft.unverified_claims,
                },
                object_type="content_item", object_id=draft.id,
                requested_by_agent="editor",
                status="pending",
                policy_rule="always_human:content_publish" if not gates_ok else "risk_floor:medium",
                batch_key="content_publish",
            )
        )

    broken = by_code.get("page_404_linked", [])[:1]
    for finding in broken:
        out.append(
            Approval(
                org_id=org_id, site_id=site_id,
                type="redirect_apply", risk="high", reversible=True,
                title=f"Redirect the broken link to {finding.url}",
                summary="An internal link points at a URL that returns 404.",
                rationale="The link is live in the navigation, so every crawl spends budget on it.",
                expected_impact="Recovers the crawl budget spent on a dead URL and the link equity pointing at it.",
                action={"tool": "site.redirect", "from": finding.url, "to": "https://www.iana.org/help"},
                preview={"from": finding.url, "to": "https://www.iana.org/help", "code": 301},
                object_type="finding", object_id=finding.id,
                requested_by_agent="technical-seo",
                status="pending",
                policy_rule="always_human:bulk_redirect_apply",
                batch_key="redirect_apply",
            )
        )
    return out


# ----------------------------------------------------------------------- kpis


def kpis(org_id: str, site_id: str) -> list[KpiSnapshot]:
    """Twelve weeks of traffic, marked as demo data.

    A live tenant reads these from Search Console and Analytics. Nothing here
    was measured, and ``source`` says so on every row so no screen can present
    it as if it had been.
    """
    series = {
        "organic_clicks": [1840, 1795, 1902, 1888, 1951, 2044, 2012, 2130, 2208, 2297, 2354, 2471],
        "organic_impressions": [86000, 84200, 88100, 87400, 90500, 94800, 93200, 99100,
                                102400, 106900, 109800, 115200],
        "avg_position": [18.4, 18.6, 18.1, 18.2, 17.7, 17.2, 17.4, 16.8, 16.3, 15.9, 15.6, 15.1],
        "indexed_pages": [141, 142, 142, 144, 145, 145, 147, 147, 148, 149, 150, 150],
    }
    rows = []
    for metric, values in series.items():
        for i, value in enumerate(values):
            rows.append(
                KpiSnapshot(
                    org_id=org_id, site_id=site_id,
                    measured_on=(NOW - timedelta(weeks=len(values) - 1 - i)).date(),
                    metric=metric, dimension="site", value=float(value),
                    source="demo", meta={"demo": True, "note": "Sample series; connect GSC for measured data."},
                )
            )
    return rows


def keywords(org_id: str, site_id: str) -> list[Keyword]:
    seeds = [
        ("root zone database", 8100, 31.0, "informational", 3.2, True),
        ("protocol parameter registry", 1300, 22.0, "informational", 7.8, False),
        ("tld delegation record", 590, 18.0, "informational", 11.4, False),
        ("ip address allocation", 4400, 44.0, "informational", 14.9, True),
        ("who manages the root zone", 720, 26.0, "informational", 5.6, False),
    ]
    return [
        Keyword(
            org_id=org_id, site_id=site_id, phrase=phrase, country="us", language="en",
            volume=volume, difficulty=difficulty, intent=intent,
            current_position=position, is_tracked=True, is_branded=False,
            has_ai_overview=ai_overview, serp_features=["ai_overview"] if ai_overview else [],
            source="demo",
        )
        for phrase, volume, difficulty, intent, position, ai_overview in seeds
    ]


def notifications(org_id: str, site_id: str) -> list[Notification]:
    return [
        Notification(
            org_id=org_id, site_id=site_id, kind="approval_waiting", severity="info",
            title="20 decisions are waiting for you",
            body="18 meta descriptions batched as one decision, two drafts, one redirect.",
            link=f"/sites/{site_id}/approvals", data={}, channels=["in_app"], delivered={},
        ),
        Notification(
            org_id=org_id, site_id=site_id, kind="gate_failed", severity="warning",
            title="A draft did not pass the fact check",
            body="Two figures in 'What a protocol parameter registry is for' have no primary source.",
            link=f"/sites/{site_id}/content", data={}, channels=["in_app"], delivered={},
        ),
        Notification(
            org_id=org_id, site_id=site_id, kind="crawl_complete", severity="info",
            title="Audit finished: 150 pages, 789 findings",
            body="Health 44.8, AEO 37.1. The largest single issue affects 41 pages.",
            link=f"/sites/{site_id}/findings", data={}, channels=["in_app"], delivered={},
        ),
    ]


# ------------------------------------------------------------------------ run


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org-id", required=True)
    parser.add_argument("--site-id", required=True)
    args = parser.parse_args()

    async with session_scope() as session:
        site = (
            await session.execute(select(Site).where(Site.id == args.site_id))
        ).scalar_one()
        pages = list(
            (await session.execute(select(Page).where(Page.site_id == site.id))).scalars().all()
        )
        found = list(
            (
                await session.execute(
                    select(Finding).where(Finding.site_id == site.id, Finding.status == "open")
                )
            ).scalars().all()
        )

        site.status = "active"
        site.onboarding_step = "complete"
        site.business_type = "publisher"
        site.industry = "internet infrastructure"
        site.autonomy = "assisted"
        site.goals = {
            "primary": "Be the cited source when an answer engine explains a registry",
            "targets": {"aeo_score": 70, "health_score": 80},
        }

        session.add(live_audit_report(args.org_id, site, pages, found))
        session.add(brand_profile(args.org_id, site.id, site))
        for fact in brand_facts(args.org_id, site.id, pages):
            session.add(fact)

        drafts = content_items(args.org_id, site.id)
        for item in drafts:
            session.add(item)
        await session.flush()

        decisions = approvals(args.org_id, site.id, found, drafts)
        for approval in decisions:
            session.add(approval)
        for row in kpis(args.org_id, site.id):
            session.add(row)
        for kw in keywords(args.org_id, site.id):
            session.add(kw)
        for note in notifications(args.org_id, site.id):
            session.add(note)

        await session.flush()
        print(f"site      {site.id} -> {site.status}/{site.autonomy}")
        print(f"content   {len(drafts)}")
        print(f"approvals {len(decisions)}")
        print(f"findings  {len(found)} open, pages {len(pages)}")

    from seoos.missions.scheduler import bootstrap_schedules

    async with session_scope() as session:
        site = (await session.execute(select(Site).where(Site.id == args.site_id))).scalar_one()
        made = await bootstrap_schedules(session, site)
        print(f"schedules {[s.mission_key for s in made]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
