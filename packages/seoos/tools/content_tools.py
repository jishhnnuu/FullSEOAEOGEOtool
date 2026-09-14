"""Content: briefs, drafts, editing, quality gates and the review queue."""

from __future__ import annotations

import re

from sqlalchemy import select

from seoos.analysis.checks.aeo import score_page_aeo
from seoos.analysis.checks.content import ai_pattern_score, readability
from seoos.analysis.checks.schema import generate_jsonld, validate_jsonld
from seoos.analysis.parser import parse_html
from seoos.core.models import ContentItem
from seoos.services.content import ContentService, slugify
from seoos.tools._helpers import array, boolean, integer, load_site, number, obj, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool

CONTENT_TYPES = [
    "article", "pillar", "comparison", "listicle", "how_to", "glossary",
    "landing_page", "product_page", "category_page", "case_study", "faq",
    "location_page", "meta_rewrite", "on_page_update", "programmatic",
]


@tool(
    "content.create",
    """Create a content item. Starts at 'idea' and moves through the pipeline
    as each specialist finishes with it. The client only ever sees it at
    'review'.""",
    schema(
        title=string("Working title"),
        content_type_=string("What kind of page", enum=CONTENT_TYPES, default="article"),
        primary_keyword_=string("The single query this page is for"),
        secondary_keywords_=array("Supporting queries", {"type": "string"}),
        search_intent_=string("Intent", enum=["informational", "commercial", "transactional",
                                              "navigational", "local"]),
        target_url_=string("Existing URL if this updates a live page"),
        funnel_stage_=string("Stage", enum=["awareness", "consideration", "decision"]),
        priority_score_=number("0 to 100: how much this matters"),
    ),
    category="content",
    mutates=True,
    risk="low",
    auto_from="propose",
)
async def content_create(ctx: ToolContext, title: str, **fields) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    service = ContentService(ctx.session)
    item = await service.create(
        org_id=ctx.org_id,
        site_id=site.id,
        title=title,
        content_type=fields.pop("content_type", "article"),
        created_by_agent=ctx.agent_key,
        mission_run_id=ctx.mission_run_id,
        **{k: v for k, v in fields.items() if v is not None},
    )
    return ToolOutcome(
        ok=True,
        summary=f"Created {item.type} '{title}' ({item.id})",
        data={"content_id": item.id, "slug": item.slug, "status": item.status},
    )


@tool(
    "content.save_brief",
    """Attach a brief to a content item and move it to 'briefed'.

    A brief is what makes the difference between a writer producing something
    generic and something that ranks. It must say what the page has to beat,
    not just what it should mention.""",
    schema(
        content_id=string("The content item"),
        brief=obj(
            "The brief",
            angle_=string("The specific take that makes this worth reading"),
            audience_=string("Who this is for and what they already know"),
            search_intent_=string("What the searcher actually wants"),
            must_answer_=array("Questions the page must answer", {"type": "string"}),
            must_beat_=array("Competing URLs and what each does well", {"type": "object"}),
            differentiation_=string("What this page has that the ranking results do not"),
            evidence_needed_=array("Data, examples or quotes to gather", {"type": "string"}),
            internal_links_=array("Pages to link to and why", {"type": "object"}),
            word_count_target_=integer("Target length"),
            format_=string("The format that wins this query"),
            cta_=string("What the reader should do next"),
        ),
        outline_=array("Section headings in order", {"type": "object"}),
    ),
    category="content",
    mutates=True,
    risk="low",
    auto_from="propose",
)
async def content_save_brief(
    ctx: ToolContext, content_id: str, brief: dict, outline: list[dict] | None = None
) -> ToolOutcome:
    service = ContentService(ctx.session)
    item = await service.get(content_id, org_id=ctx.org_id)
    item.brief = brief
    if outline:
        item.outline = outline
    if item.status == "idea":
        await service.transition(content_id, "briefed", author=ctx.agent_key or "agent")
    await ctx.session.flush()
    return ToolOutcome(
        ok=True,
        summary=f"Brief saved for '{item.title}'",
        data={"content_id": item.id, "status": item.status},
    )


@tool(
    "content.save_draft",
    """Save draft body copy. Runs the quality gates automatically and reports
    what still needs fixing, so the next pass is targeted rather than a
    general rewrite.""",
    schema(
        content_id=string("The content item"),
        body_markdown=string("The full draft in markdown"),
        meta_title_=string("Title tag, 50 to 60 characters"),
        meta_description_=string("Meta description, 140 to 160 characters"),
        title_=string("Updated H1 or working title"),
        external_sources_=array("Sources cited, as objects with url and claim",
                                {"type": "object"}),
        internal_links_=array("Internal links used", {"type": "object"}),
        advance_=boolean("Move the item forward in the pipeline", default=True),
    ),
    category="content",
    mutates=True,
    risk="low",
    auto_from="propose",
)
async def content_save_draft(
    ctx: ToolContext,
    content_id: str,
    body_markdown: str,
    advance: bool = True,
    **fields,
) -> ToolOutcome:
    service = ContentService(ctx.session)
    item = await service.get(content_id, org_id=ctx.org_id)

    item.body_markdown = body_markdown
    item.word_count = len(body_markdown.split())
    for key in ("meta_title", "meta_description", "title"):
        if fields.get(key):
            setattr(item, key, fields[key])
    if fields.get("external_sources"):
        item.external_sources = fields["external_sources"]
    if fields.get("internal_links"):
        item.internal_links = fields["internal_links"]
    if not item.slug and item.title:
        item.slug = slugify(item.title)

    gates = await _run_gates(ctx, item)
    item.gate_results = gates
    item.quality_score = gates["quality_score"]
    item.brand_score = gates["brand_score"]
    item.ai_pattern_score = gates["ai_pattern_score"]
    item.readability_score = gates["readability_score"]
    item.aeo_score = gates["aeo_score"]
    item.unverified_claims = gates["unverified_claims"]
    item.claims_verified = not gates["unverified_claims"]

    if advance and item.status in ("briefed", "drafting"):
        if item.status == "briefed":
            await service.transition(content_id, "drafting", author=ctx.agent_key or "agent",
                                     snapshot=False)
        await service.transition(content_id, "editing", author=ctx.agent_key or "agent")
    else:
        await service.snapshot(item, stage=item.status, author=ctx.agent_key or "agent")

    await ctx.session.flush()
    failures = ContentService.failing_gates(item)
    return ToolOutcome(
        ok=True,
        summary=(
            f"Draft saved ({item.word_count} words). "
            + ("Ready for review." if not failures else f"{len(failures)} gates still failing.")
        ),
        data={
            "content_id": item.id,
            "status": item.status,
            "scores": {
                "quality": item.quality_score,
                "brand": item.brand_score,
                "ai_pattern": item.ai_pattern_score,
                "readability": item.readability_score,
                "aeo": item.aeo_score,
            },
            "failing_gates": failures,
            "gate_detail": gates,
        },
    )


async def _run_gates(ctx: ToolContext, item: ContentItem) -> dict:
    """Every automated check a draft must pass before a human sees it."""
    from seoos.tools.brand_tools import brand_profile, score_brand_voice

    text = item.body_markdown or ""
    profile_result = await brand_profile(ctx)
    profile = profile_result.data if profile_result.ok else {}
    voice = score_brand_voice(text, profile)
    machine = ai_pattern_score(text)
    read = readability(text)

    html = _markdown_to_html(text)
    signals = parse_html(html, item.target_url or "https://example.com/draft")
    aeo = score_page_aeo(signals)

    claims = extract_claims(text)
    cited_urls = {
        (s.get("url") or "").lower()
        for s in (item.external_sources or []) if isinstance(s, dict)
    }
    fact_statements = await _known_facts(ctx)
    unverified = [
        claim for claim in claims
        if not _claim_supported(claim, fact_statements, cited_urls, text)
    ]

    quality = _quality_score(item, read, aeo, len(unverified))
    return {
        "brand_score": voice["score"],
        "brand_violations": voice["violations"],
        "ai_pattern_score": machine["score"],
        "ai_pattern_hits": machine["hits"],
        "readability_score": read.get("score"),
        "readability": read,
        "aeo_score": aeo["score"],
        "aeo_components": {k: v for k, v in aeo.items() if k != "score"},
        "quality_score": quality,
        "claims_found": len(claims),
        "unverified_claims": unverified[:20],
        "meta_title_length": len(item.meta_title or ""),
        "meta_description_length": len(item.meta_description or ""),
    }


async def _known_facts(ctx: ToolContext) -> list[str]:
    from seoos.core.models import BrandFact

    if not ctx.site_id:
        return []
    rows = (
        await ctx.session.execute(
            select(BrandFact).where(
                BrandFact.site_id == ctx.site_id, BrandFact.status == "active"
            )
        )
    ).scalars().all()
    return [r.statement.lower() for r in rows]


# Word boundaries are applied only where the pattern ends in a word
# character. A trailing \b after "%" would never match, because the character
# after a percent sign is almost always a space and neither is a word char.
_CLAIM_RE = re.compile(
    r"[^.!?\n]*(?:"
    r"\b\d+(?:[.,]\d+)?\s?%|"
    r"\b\d+(?:[.,]\d+)?\s?(?:percent|x)\b|"
    r"\b\d{1,3}(?:,\d{3})+\b|"
    r"\b(?:studies|study|research|survey|report|data)\s+(?:show|shows|found|suggests|suggest)\b|"
    r"\b(?:we|our)\s+(?:helped|increased|grew|reduced|saved|delivered)\b|"
    r"\b(?:according to)\s+\w+"
    r")[^.!?\n]*[.!?]",
    re.I,
)


def extract_claims(text: str) -> list[str]:
    """Pull out sentences that assert something checkable.

    Statistics, named research and first-person performance claims are where
    published content gets a company into trouble, so those are exactly what
    gets flagged.
    """
    return [m.group(0).strip() for m in _CLAIM_RE.finditer(text or "")][:40]


def _claim_supported(
    claim: str, known_facts: list[str], cited_urls: set[str], full_text: str
) -> bool:
    lowered = claim.lower()
    for fact in known_facts:
        terms = {w for w in re.findall(r"\w{5,}", fact)}
        if terms and len(terms & set(re.findall(r"\w{5,}", lowered))) >= max(2, len(terms) // 3):
            return True
    # A markdown link or a citation marker inside the same sentence counts as
    # sourced; the fact-checker agent verifies that the source says what the
    # sentence claims.
    if re.search(r"\[[^\]]+\]\(https?://", claim) or re.search(r"https?://", claim):
        return True
    if cited_urls and re.search(r"\[\^?\d+\]|\(source:", lowered):
        return True
    return False


def _quality_score(item: ContentItem, read: dict, aeo: dict, unverified: int) -> float:
    score = 100.0
    words = item.word_count or 0
    if words < 300:
        score -= 25
    elif words < 600:
        score -= 8
    if not item.meta_title:
        score -= 8
    elif not (25 <= len(item.meta_title) <= 62):
        score -= 4
    if not item.meta_description:
        score -= 8
    elif not (110 <= len(item.meta_description) <= 165):
        score -= 3
    if not item.internal_links:
        score -= 8
    if not item.external_sources:
        score -= 5
    score -= min(unverified * 6, 25)
    grade = read.get("grade")
    if grade is not None and grade > 14:
        score -= 6
    score -= max(0, (60 - aeo.get("score", 60)) * 0.25)
    return round(max(0.0, score), 1)


@tool(
    "content.submit_for_review",
    """Move a finished draft into the client's approval queue. Refuses if any
    automated gate is still failing: the client's time is for judging
    substance, not for catching things we should have caught.""",
    schema(
        content_id=string("The content item"),
        note_=string("What the reviewer should pay attention to"),
    ),
    category="content",
    mutates=True,
    risk="medium",
    approval_type="content_publish",
    auto_from="propose",
)
async def content_submit_for_review(
    ctx: ToolContext, content_id: str, note: str | None = None
) -> ToolOutcome:
    from seoos.core.errors import Conflict

    service = ContentService(ctx.session)
    item = await service.get(content_id, org_id=ctx.org_id)
    if item.status == "editing":
        await service.transition(content_id, "qa", author=ctx.agent_key or "agent",
                                 snapshot=False)
    try:
        await service.transition(
            content_id, "review", author=ctx.agent_key or "agent", note=note
        )
    except Conflict as exc:
        return ToolOutcome(
            ok=False,
            error=exc.message,
            data={"failing_gates": ContentService.failing_gates(item)},
        )
    return ToolOutcome(
        ok=True,
        summary=f"'{item.title}' is in the client's review queue",
        data={"content_id": item.id, "status": item.status},
    )


@tool(
    "content.get",
    """Read a content item: brief, outline, body, scores and gate results.""",
    schema(
        content_id=string("The content item"),
        include_body_=boolean("Include the full body text", default=True),
    ),
    category="content",
)
async def content_get(ctx: ToolContext, content_id: str, include_body: bool = True) -> ToolOutcome:
    item = await ContentService(ctx.session).get(content_id, org_id=ctx.org_id)
    data = {
        "content_id": item.id,
        "title": item.title,
        "type": item.type,
        "status": item.status,
        "slug": item.slug,
        "meta_title": item.meta_title,
        "meta_description": item.meta_description,
        "primary_keyword": item.primary_keyword,
        "secondary_keywords": item.secondary_keywords,
        "brief": item.brief,
        "outline": item.outline,
        "word_count": item.word_count,
        "scores": {
            "quality": item.quality_score, "brand": item.brand_score,
            "aeo": item.aeo_score, "ai_pattern": item.ai_pattern_score,
        },
        "unverified_claims": item.unverified_claims,
        "gate_results": item.gate_results,
        "published_url": item.published_url,
        "reviewer_notes": item.reviewer_notes,
    }
    if include_body:
        data["body_markdown"] = item.body_markdown
    return ToolOutcome(ok=True, summary=f"{item.title} ({item.status})", data=data)


@tool(
    "content.queue",
    """List content at a given stage. Use this to find what needs work rather
    than creating something new when there is a half-finished draft sitting
    in the pipeline.""",
    schema(
        statuses_=array("Stages to include", {"type": "string"}),
        limit_=integer("Maximum items", minimum=1, maximum=200, default=40),
    ),
    category="content",
)
async def content_queue(
    ctx: ToolContext, statuses: list[str] | None = None, limit: int = 40
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    items = await ContentService(ctx.session).queue(site.id, statuses=statuses, limit=limit)
    by_status: dict[str, int] = {}
    for item in items:
        by_status[item.status] = by_status.get(item.status, 0) + 1
    return ToolOutcome(
        ok=True,
        summary=f"{len(items)} items: " + ", ".join(f"{v} {k}" for k, v in by_status.items()),
        data={
            "items": [
                {
                    "content_id": i.id, "title": i.title, "type": i.type,
                    "status": i.status, "primary_keyword": i.primary_keyword,
                    "priority": i.priority_score, "word_count": i.word_count,
                    "assigned_agent": i.assigned_agent,
                }
                for i in items
            ],
            "by_status": by_status,
        },
    )


@tool(
    "content.generate_schema",
    """Generate valid JSON-LD for a page and attach it to the content item.
    Picks the type from the page's purpose and drops empty properties, because
    markup with blank fields validates as broken.""",
    schema(
        content_id=string("The content item"),
        schema_type_=string("Force a specific schema.org type"),
        properties_=obj("Extra properties to include"),
    ),
    category="content",
    mutates=True,
    risk="low",
    auto_from="assisted",
)
async def content_generate_schema(
    ctx: ToolContext,
    content_id: str,
    schema_type: str | None = None,
    properties: dict | None = None,
) -> ToolOutcome:
    site = await load_site(ctx)
    item = await ContentService(ctx.session).get(content_id, org_id=ctx.org_id)

    inferred = schema_type or {
        "article": "Article", "pillar": "Article", "how_to": "HowTo",
        "faq": "FAQPage", "comparison": "Article", "listicle": "Article",
        "product_page": "Product", "location_page": "LocalBusiness",
        "case_study": "Article", "glossary": "DefinedTerm",
    }.get(item.type, "Article")

    base: dict = {
        "headline": item.meta_title or item.title,
        "name": item.title,
        "description": item.meta_description,
        "url": item.published_url or (
            f"{site.base_url.rstrip('/')}/{item.slug}" if site and item.slug else None
        ),
        "datePublished": item.published_at.isoformat() if item.published_at else None,
        "dateModified": item.updated_at.isoformat() if item.updated_at else None,
    }
    if site:
        base["publisher"] = {"@type": "Organization", "name": site.name, "url": site.base_url}

    if inferred == "FAQPage":
        questions = _extract_faq(item.body_markdown or "")
        base = {
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in questions
            ]
        }
        if not questions:
            return ToolOutcome(
                ok=False,
                error=(
                    "FAQPage markup needs question headings with answers beneath "
                    "them, and this draft has none. Add them or use a different type."
                ),
            )

    block = generate_jsonld(inferred, {**base, **(properties or {})})
    validation = validate_jsonld([block], page_text=item.body_markdown or "")
    if not validation["valid"]:
        return ToolOutcome(
            ok=False,
            error="Generated markup did not validate",
            data={"issues": validation["errors"], "block": block},
        )

    item.schema_jsonld = block
    await ctx.session.flush()
    return ToolOutcome(
        ok=True,
        summary=f"{inferred} markup generated and validated",
        data={"schema": block, "validation": validation},
    )


def _extract_faq(markdown: str) -> list[tuple[str, str]]:
    """Pull question headings and the paragraph under each."""
    pairs: list[tuple[str, str]] = []
    blocks = re.split(r"\n(?=#{2,4}\s)", markdown or "")
    for block in blocks:
        match = re.match(r"#{2,4}\s+(.+?)\n(.*)", block, re.S)
        if not match:
            continue
        heading, body = match.group(1).strip(), match.group(2).strip()
        if not heading.endswith("?"):
            continue
        answer = re.split(r"\n\s*\n", body)[0].strip()
        # Strip list markers: an FAQ answer rendered into JSON-LD should read
        # as a sentence, not as "1. 2. 3." run together.
        answer = re.sub(r"^\s*(?:\d+\.|[-*])\s*", "", answer, flags=re.M)
        answer = re.sub(r"\s+", " ", answer).strip()
        if len(answer) > 30:
            pairs.append((heading, answer[:1200]))
    return pairs[:20]


_ORDERED_PREFIX = re.compile(r"^\s*\d+\.\s*")


def _markdown_to_html(markdown: str) -> str:
    """A small markdown renderer.

    Only needed so the AEO analyser can see the document's structure; a full
    markdown library would be a heavier dependency than the job warrants.
    """
    html: list[str] = []
    for block in re.split(r"\n\s*\n", markdown or ""):
        block = block.strip()
        if not block:
            continue
        heading = re.match(r"^(#{1,6})\s+(.*)$", block)
        if heading:
            level = len(heading.group(1))
            html.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
            continue
        if re.match(r"^\s*[-*]\s+", block):
            items = "".join(
                f"<li>{_inline(line.lstrip('-* ').strip())}</li>"
                for line in block.splitlines() if line.strip()
            )
            html.append(f"<ul>{items}</ul>")
            continue
        if re.match(r"^\s*\d+\.\s+", block):
            entries = [
                _ORDERED_PREFIX.sub("", line).strip()
                for line in block.splitlines() if line.strip()
            ]
            items = "".join(f"<li>{_inline(entry)}</li>" for entry in entries)
            html.append(f"<ol>{items}</ol>")
            continue
        if block.startswith("|"):
            rows = "".join(
                "<tr>" + "".join(f"<td>{_inline(c.strip())}</td>"
                                 for c in line.strip("|").split("|")) + "</tr>"
                for line in block.splitlines() if "---" not in line
            )
            html.append(f"<table>{rows}</table>")
            continue
        html.append(f"<p>{_inline(block)}</p>")
    return "<main>" + "".join(html) + "</main>"


def _inline(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return text
