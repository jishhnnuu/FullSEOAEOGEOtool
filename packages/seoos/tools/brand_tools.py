"""The brand brain: what the company sounds like and what it may claim.

Every writing agent reads from here before drafting. Without it, generated
content is generically competent and unmistakably not the client, which is
the reason most AI content programmes quietly get shut down.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import select

from seoos.core.models import BrandAsset, BrandFact, BrandProfile
from seoos.llm.embeddings import chunk_text, cosine, hashing_embed
from seoos.tools._helpers import array, integer, load_site, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool


@tool(
    "brand.profile",
    """Read the active brand profile: positioning, audiences, tone, the words
    to use and avoid, required disclaimers and CTA patterns.

    Call this before writing anything the client will publish.""",
    schema(),
    category="brand",
)
async def brand_profile(ctx: ToolContext) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    profile = (
        await ctx.session.execute(
            select(BrandProfile)
            .where(BrandProfile.site_id == site.id, BrandProfile.is_active.is_(True))
            .order_by(BrandProfile.version.desc())
        )
    ).scalars().first()

    if profile is None:
        return ToolOutcome(
            ok=True,
            degraded=True,
            summary="No brand profile has been built yet",
            data={
                "exists": False,
                "guidance": (
                    "Write in plain, specific language. Do not invent facts about "
                    "the company, its customers, its pricing or its results. "
                    "Anything you cannot source, leave out."
                ),
            },
        )

    return ToolOutcome(
        ok=True,
        summary=f"Brand profile v{profile.version}",
        data={
            "exists": True,
            "version": profile.version,
            "one_liner": profile.one_liner,
            "value_props": profile.value_props,
            "differentiators": profile.differentiators,
            "proof_points": profile.proof_points,
            "audiences": profile.audiences,
            "personas": profile.personas,
            "tone_attributes": profile.tone_attributes,
            "reading_level": profile.reading_level,
            "person": profile.person,
            "sentence_rhythm": profile.sentence_rhythm,
            "vocabulary_prefer": profile.vocabulary_prefer,
            "vocabulary_avoid": profile.vocabulary_avoid,
            "banned_phrases": profile.banned_phrases,
            "formatting_rules": profile.formatting_rules,
            "example_passages": profile.example_passages[:3],
            "claims_policy": profile.claims_policy,
            "required_disclaimers": profile.required_disclaimers,
            "cta_patterns": profile.cta_patterns,
            "boilerplate": profile.boilerplate,
        },
    )


@tool(
    "brand.save_profile",
    """Write a new version of the brand profile. Never edits the old one: a
    published page can always be traced to the voice rules in force when it
    was written.""",
    schema(
        one_liner=string("What the company does, in one sentence, in their words"),
        tone_attributes=array("Three to six adjectives for the voice", {"type": "string"}),
        audiences=array("Who they sell to", {"type": "object"}),
        value_props_=array("What they claim as their value", {"type": "string"}),
        differentiators_=array("What makes them different from named competitors", {"type": "string"}),
        proof_points_=array("Evidence they can cite: numbers, awards, named clients", {"type": "string"}),
        vocabulary_prefer_=array("Words and phrases they use", {"type": "string"}),
        vocabulary_avoid_=array("Words and phrases they never use", {"type": "string"}),
        banned_phrases_=array("Phrases that must never appear", {"type": "string"}),
        reading_level_=string("Target reading level, e.g. 'plain English, grade 8'"),
        person_=string("Narrative person", enum=["first", "second", "third"]),
        sentence_rhythm_=string("How their sentences move, e.g. 'short, declarative, few subclauses'"),
        claims_policy_=string("What they will and will not claim in public"),
        required_disclaimers_=array("Disclaimers that must appear", {"type": "string"}),
        cta_patterns_=array("How they ask for the next step", {"type": "string"}),
        example_passages_=array("Two or three passages of their own best writing", {"type": "string"}),
        derived_from_=array("Brand asset ids this was distilled from", {"type": "string"}),
    ),
    category="brand",
    mutates=True,
    risk="low",
    approval_type="brand_profile",
    auto_from="assisted",
)
async def brand_save_profile(ctx: ToolContext, **fields) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    previous = (
        await ctx.session.execute(
            select(BrandProfile)
            .where(BrandProfile.site_id == site.id, BrandProfile.is_active.is_(True))
            .order_by(BrandProfile.version.desc())
        )
    ).scalars().first()
    for row in (
        await ctx.session.execute(
            select(BrandProfile).where(
                BrandProfile.site_id == site.id, BrandProfile.is_active.is_(True)
            )
        )
    ).scalars().all():
        row.is_active = False

    profile = BrandProfile(
        org_id=ctx.org_id,
        site_id=site.id,
        version=(previous.version + 1) if previous else 1,
        is_active=True,
    )
    for key, value in fields.items():
        if hasattr(profile, key) and value is not None:
            setattr(profile, key, value)
    # House style is enforced platform-wide, so it is merged in rather than
    # left to whoever filled the form.
    house_bans = ["delve", "leverage", "unlock", "elevate", "seamless", "robust",
                  "in today's fast-paced world", "it's important to note"]
    profile.banned_phrases = sorted(set((profile.banned_phrases or []) + house_bans))
    ctx.session.add(profile)
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=f"Brand profile v{profile.version} saved",
        data={"version": profile.version, "profile_id": profile.id},
    )


@tool(
    "brand.search_assets",
    """Search the client's uploaded documents and crawled pages for passages
    relevant to a topic. Use this to ground a draft in what the company has
    actually said rather than in what sounds plausible.""",
    schema(
        query=string("What you are looking for"),
        limit_=integer("How many passages", minimum=1, maximum=12, default=5),
        kinds_=array("Restrict to these asset kinds", {"type": "string"}),
    ),
    category="brand",
)
async def brand_search_assets(
    ctx: ToolContext, query: str, limit: int = 5, kinds: list[str] | None = None
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    stmt = select(BrandAsset).where(
        BrandAsset.site_id == site.id, BrandAsset.status.in_(["extracted", "indexed"])
    )
    if kinds:
        stmt = stmt.where(BrandAsset.kind.in_(kinds))
    assets = list((await ctx.session.execute(stmt)).scalars().all())
    if not assets:
        return ToolOutcome(
            ok=True,
            degraded=True,
            summary="No brand assets have been uploaded or extracted yet",
            data={"passages": []},
        )

    query_vec = hashing_embed(query)
    scored: list[tuple[float, dict]] = []
    for asset in assets:
        chunks = asset.embedding_chunks or []
        if not chunks:
            # Not indexed yet: fall back to a substring scan so the tool is
            # still useful the moment a document lands.
            text = asset.extracted_text or ""
            if query.lower() in text.lower():
                index = text.lower().index(query.lower())
                scored.append(
                    (0.5, {
                        "asset_id": asset.id,
                        "title": asset.title or asset.filename,
                        "kind": asset.kind,
                        "passage": text[max(0, index - 200): index + 600],
                        "score": 0.5,
                        "note": "substring match; this asset is not indexed yet",
                    })
                )
            continue
        for chunk in chunks:
            score = cosine(query_vec, chunk.get("vector") or [])
            if score > 0.15:
                scored.append(
                    (score, {
                        "asset_id": asset.id,
                        "title": asset.title or asset.filename,
                        "kind": asset.kind,
                        "passage": chunk.get("text", "")[:900],
                        "score": round(score, 3),
                    })
                )

    scored.sort(key=lambda item: item[0], reverse=True)
    passages = [entry for _, entry in scored[:limit]]
    return ToolOutcome(
        ok=True,
        summary=f"{len(passages)} relevant passages from {len(assets)} assets",
        data={"passages": passages},
    )


@tool(
    "brand.facts",
    """Read the fact ledger: the verified claims this brand is willing to make
    in public, with their sources.

    A writer may state a fact from this ledger, or cite an external source.
    Anything else is invention and must not be published.""",
    schema(
        query_=string("Filter to facts matching this topic"),
        category_=string("Filter by category",
                         enum=["pricing", "capability", "credential", "metric",
                               "policy", "people", "general"]),
        limit_=integer("How many", minimum=1, maximum=100, default=30),
    ),
    category="brand",
)
async def brand_facts(
    ctx: ToolContext, query: str | None = None, category: str | None = None, limit: int = 30
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    stmt = select(BrandFact).where(
        BrandFact.site_id == site.id, BrandFact.status == "active"
    )
    if category:
        stmt = stmt.where(BrandFact.category == category)
    rows = list((await ctx.session.execute(stmt)).scalars().all())

    now = datetime.now(UTC)
    live = [
        r for r in rows
        if not r.valid_until or r.valid_until.replace(tzinfo=UTC) > now
    ]
    if query:
        query_terms = {w for w in re.findall(r"\w{4,}", query.lower())}
        live = [
            r for r in live
            if query_terms & {w for w in re.findall(r"\w{4,}", r.statement.lower())}
        ]

    return ToolOutcome(
        ok=True,
        summary=f"{len(live)} usable facts",
        data={
            "facts": [
                {
                    "id": r.id,
                    "statement": r.statement,
                    "category": r.category,
                    "source": r.source_ref or r.source_type,
                    "confidence": r.confidence,
                    "expires": r.valid_until.isoformat() if r.valid_until else None,
                }
                for r in live[:limit]
            ],
            "expired_count": len(rows) - len(live),
        },
    )


@tool(
    "brand.add_facts",
    """Add verified claims to the fact ledger. Every fact needs a source: a
    client document, a page on their site, or a named external reference.
    A fact with no source is a guess and does not belong here.""",
    schema(
        facts=array(
            "Facts to add",
            {
                "type": "object",
                "properties": {
                    "statement": {"type": "string"},
                    "category": {"type": "string"},
                    "source_ref": {"type": "string",
                                   "description": "URL, document name or quote location"},
                    "source_type": {"type": "string",
                                    "enum": ["client_asset", "site_page", "external", "client_stated"]},
                    "valid_until": {"type": "string", "description": "ISO date if it expires"},
                    "confidence": {"type": "number"},
                },
                "required": ["statement", "source_ref"],
            },
            max_items=100,
        ),
    ),
    category="brand",
    mutates=True,
    risk="low",
    auto_from="assisted",
)
async def brand_add_facts(ctx: ToolContext, facts: list[dict]) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    existing = {
        row.statement.strip().lower()
        for row in (
            await ctx.session.execute(select(BrandFact).where(BrandFact.site_id == site.id))
        ).scalars().all()
    }
    added = skipped = 0
    for entry in facts[:100]:
        statement = (entry.get("statement") or "").strip()
        if not statement or statement.lower() in existing:
            skipped += 1
            continue
        valid_until = None
        if entry.get("valid_until"):
            try:
                valid_until = datetime.fromisoformat(entry["valid_until"]).replace(
                    tzinfo=UTC
                )
            except ValueError:
                valid_until = None
        ctx.session.add(
            BrandFact(
                org_id=ctx.org_id,
                site_id=site.id,
                statement=statement,
                category=entry.get("category", "general"),
                source_type=entry.get("source_type", "client_asset"),
                source_ref=entry.get("source_ref"),
                confidence=float(entry.get("confidence", 0.8)),
                valid_until=valid_until,
            )
        )
        existing.add(statement.lower())
        added += 1
    await ctx.session.flush()
    return ToolOutcome(ok=True, summary=f"{added} facts added, {skipped} skipped as duplicates")


@tool(
    "brand.check_voice",
    """Score a draft against the brand profile and report exactly what to
    change. Run this before anything reaches a human reviewer: a client should
    never be the one to notice that a draft uses a banned phrase.""",
    schema(
        text=string("The draft to check"),
    ),
    category="brand",
)
async def brand_check_voice(ctx: ToolContext, text: str) -> ToolOutcome:
    profile_result = await brand_profile(ctx)
    profile = profile_result.data if profile_result.ok else {}
    report = score_brand_voice(text, profile)
    return ToolOutcome(
        ok=True,
        summary=f"Brand voice score {report['score']}/100, {len(report['violations'])} violations",
        data=report,
        degraded=not profile.get("exists"),
    )


def score_brand_voice(text: str, profile: dict) -> dict:
    """Deterministic brand-voice scoring.

    Deliberately rule-based rather than model-judged: the same draft must
    score the same way every time, or the gate is not a gate.
    """
    from seoos.analysis.checks.content import ai_pattern_score, readability

    lowered = (text or "").lower()
    violations: list[dict] = []
    penalty = 0.0

    for phrase in profile.get("banned_phrases", []) or []:
        if phrase and phrase.lower() in lowered:
            violations.append({"kind": "banned_phrase", "detail": phrase, "severity": "high"})
            penalty += 8

    for word in profile.get("vocabulary_avoid", []) or []:
        if word and re.search(rf"\b{re.escape(word.lower())}\b", lowered):
            violations.append({"kind": "avoided_word", "detail": word, "severity": "medium"})
            penalty += 4

    dashes = len(re.findall(r"[–—]", text or ""))
    if dashes:
        violations.append(
            {"kind": "dash_punctuation", "detail": f"{dashes} em or en dashes", "severity": "medium"}
        )
        penalty += min(dashes * 3, 12)

    preferred = profile.get("vocabulary_prefer", []) or []
    hits = sum(1 for word in preferred if word and word.lower() in lowered)
    preferred_ratio = hits / len(preferred) if preferred else None
    if preferred_ratio is not None and preferred_ratio < 0.15 and len(preferred) >= 4:
        violations.append(
            {"kind": "vocabulary_drift",
             "detail": "almost none of the brand's own vocabulary appears",
             "severity": "low"}
        )
        penalty += 5

    person = profile.get("person")
    if person:
        first = len(re.findall(r"\b(we|our|us)\b", lowered))
        second = len(re.findall(r"\b(you|your)\b", lowered))
        expected_dominant = {"first": first, "second": second}.get(person)
        if expected_dominant is not None and expected_dominant == 0 and (first + second) > 0:
            violations.append(
                {"kind": "person_mismatch",
                 "detail": f"brand writes in the {person} person; this draft does not",
                 "severity": "medium"}
            )
            penalty += 6

    for disclaimer in profile.get("required_disclaimers", []) or []:
        key = " ".join(disclaimer.lower().split()[:5])
        if key and key not in lowered:
            violations.append(
                {"kind": "missing_disclaimer", "detail": disclaimer[:120], "severity": "high"}
            )
            penalty += 10

    machine = ai_pattern_score(text)
    penalty += max(0, (80 - machine["score"]) * 0.35)
    read = readability(text)

    return {
        "score": round(max(0.0, 100.0 - penalty), 1),
        "violations": violations,
        "ai_pattern_score": machine["score"],
        "ai_pattern_hits": machine["hits"],
        "readability": read,
        "preferred_vocabulary_used_pct": (
            round(preferred_ratio * 100, 1) if preferred_ratio is not None else None
        ),
        "profile_applied": bool(profile.get("exists")),
    }


def index_asset_text(text: str) -> list[dict]:
    """Chunk and embed an asset for retrieval. Used by the ingestion pipeline."""
    return [
        {"text": chunk, "vector": hashing_embed(chunk)}
        for chunk in chunk_text(text, target_chars=1100, overlap=120)
    ]
