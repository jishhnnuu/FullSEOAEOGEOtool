"""Off-page: backlinks, prospecting and outreach.

This is the work an agency charges most for and almost no software does. The
platform does the research, qualification and drafting autonomously, and
stops where judgement or a signature is genuinely needed.

Three tactics are refused outright, no matter who asks: buying links,
exchanging links at scale, and anything involving a private blog network.
They are not a grey area, they are the thing that gets a client's site
penalised, and a platform that offers them is selling a liability.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from urllib.parse import urlparse

from sqlalchemy import select

from seoos.analysis.http import same_domain
from seoos.core.errors import SafetyRefusal
from seoos.core.models import Backlink, LinkProspect, OutreachMessage, OutreachThread
from seoos.tools._helpers import (
    array,
    connector_for,
    has_connector,
    integer,
    load_site,
    schema,
    string,
)
from seoos.tools.registry import ToolContext, ToolOutcome, tool

# Patterns that mark a domain as not worth a link, or actively dangerous.
# Separators are matched as [\s-]? rather than -? because these phrases appear
# with a space far more often than with a hyphen ("guest post", "write for us").
DISQUALIFY_PATTERNS = [
    (r"(guest[\s-]?post|write[\s-]?for[\s-]?us|sponsored[\s-]?post)[^.]{0,120}"
     r"(\$|£|€|price|pricing|fee|payment|paid|rate card)", "sells guest posts"),
    (r"(buy|sell|purchase|rent)[\s-]?(back)?links?\b", "sells links"),
    (r"\b(link|backlink)[\s-]?(marketplace|package|building service|exchange)\b", "sells links"),
    (r"\bpbn\b|private[\s-]blog[\s-]network", "private blog network"),
    (r"(free|instant)[^.]{0,40}(directory|submission|listing)[^.]{0,40}"
     r"(1000|10,000|unlimited)", "bulk directory"),
    (r"article[\s-]?(directory|bank|submission site)", "article directory"),
    (r"\bdofollow\b[^.]{0,40}(\$|£|€|price|guaranteed)", "sells dofollow links"),
]
SUSPICIOUS_TLDS = {".xyz", ".top", ".loan", ".click", ".work", ".gq", ".cf", ".tk", ".ml"}


@tool(
    "offpage.backlink_profile",
    """Fetch and store the site's backlink profile: referring domains,
    anchor distribution, recently lost links and anything that looks toxic.""",
    schema(
        limit_=integer("How many links to pull", minimum=50, maximum=5000, default=500),
    ),
    category="offpage",
    cost_hint_usd=0.05,
)
async def backlink_profile(ctx: ToolContext, limit: int = 500) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    if not await has_connector(ctx, "dataforseo"):
        return ToolOutcome(
            ok=False,
            error=(
                "No backlink data provider is connected. Connect DataForSEO or "
                "Moz. Bing Webmaster Tools also reports inbound links for a "
                "verified site at no cost."
            ),
        )

    connector = await connector_for(ctx, "dataforseo")
    async with connector:
        summary = await connector.backlinks_summary(site.domain)
        detail = await connector.backlinks(site.domain, limit=limit)
    if not detail.ok:
        return ToolOutcome(ok=False, error=detail.error)

    import hashlib

    existing = {
        row.link_hash: row
        for row in (
            await ctx.session.execute(select(Backlink).where(Backlink.site_id == site.id))
        ).scalars().all()
    }
    now = datetime.now(UTC)
    seen: set[str] = set()
    new_links = 0

    for entry in detail.data:
        source = entry.get("source_url") or ""
        target = entry.get("target_url") or ""
        if not source:
            continue
        link_hash = hashlib.blake2b(f"{source}->{target}".encode(), digest_size=20).hexdigest()
        seen.add(link_hash)
        row = existing.get(link_hash)
        if row is None:
            row = Backlink(
                org_id=ctx.org_id, site_id=site.id, link_hash=link_hash,
                source_url=source[:2000],
                source_domain=(entry.get("source_domain") or _domain(source))[:255],
                target_url=target[:2000], first_seen_at=now,
            )
            ctx.session.add(row)
            new_links += 1
        row.anchor_text = (entry.get("anchor") or "")[:1000]
        row.is_dofollow = bool(entry.get("dofollow"))
        row.domain_authority = entry.get("rank")
        row.spam_score = entry.get("spam_score")
        row.last_verified_at = now
        row.risk_flags = _risk_flags(row)
        row.status = "toxic" if len(row.risk_flags) >= 2 else "live"

    lost = 0
    for link_hash, row in existing.items():
        if link_hash not in seen and row.status == "live":
            row.status = "lost"
            row.lost_at = now
            lost += 1
    await ctx.session.flush()

    anchors = _anchor_distribution([e.get("anchor") for e in detail.data])
    toxic = [e for e in detail.data if (e.get("spam_score") or 0) > 60]

    return ToolOutcome(
        ok=True,
        summary=(
            f"{summary.data.get('referring_domains') if summary.ok else '?'} referring domains, "
            f"{new_links} new, {lost} lost, {len(toxic)} look toxic"
        ),
        data={
            "summary": summary.data if summary.ok else {},
            "new_links": new_links,
            "lost_links": lost,
            "anchor_distribution": anchors,
            "toxic_candidates": toxic[:25],
            "over_optimised_anchors": anchors.get("exact_match_pct", 0) > 20,
        },
        cost_usd=detail.cost_usd + (summary.cost_usd if summary.ok else 0),
    )


def _risk_flags(row: Backlink) -> list[str]:
    flags: list[str] = []
    if (row.spam_score or 0) > 60:
        flags.append("high spam score")
    tld = "." + (row.source_domain or "").rsplit(".", 1)[-1]
    if tld in SUSPICIOUS_TLDS:
        flags.append(f"suspicious TLD {tld}")
    anchor = (row.anchor_text or "").lower()
    if anchor and len(anchor.split()) > 8:
        flags.append("unnaturally long anchor")
    if re.search(r"(casino|viagra|payday|porn|replica|essay writing)", anchor):
        flags.append("spam vertical anchor")
    return flags


def _anchor_distribution(anchors: list[str | None]) -> dict:
    """A healthy profile is mostly brand and naked URLs.

    A spike in exact-match commercial anchors is the clearest signal of a
    manipulated profile, and it is what a manual reviewer looks at first.
    """
    clean = [a.strip().lower() for a in anchors if a and a.strip()]
    if not clean:
        return {}
    naked = sum(1 for a in clean if a.startswith("http") or "." in a.split()[0])
    generic = sum(
        1 for a in clean
        if a in ("click here", "here", "read more", "learn more", "website", "link", "this")
    )
    exact_ish = sum(1 for a in clean if 2 <= len(a.split()) <= 5 and not a.startswith("http"))
    total = len(clean)
    top: dict[str, int] = {}
    for anchor in clean:
        top[anchor] = top.get(anchor, 0) + 1
    return {
        "total": total,
        "unique": len(top),
        "naked_url_pct": round(naked / total * 100, 1),
        "generic_pct": round(generic / total * 100, 1),
        "exact_match_pct": round(exact_ish / total * 100, 1),
        "top_anchors": sorted(top.items(), key=lambda kv: kv[1], reverse=True)[:15],
    }


@tool(
    "offpage.qualify_prospect",
    """Assess a domain as a link target before spending any effort on it.

    Refuses anything that sells links or looks like a network. A link from a
    site that sells links is worth less than nothing.""",
    schema(
        domain=string("The domain to assess"),
        tactic=string("How you would approach them",
                      enum=["digital_pr", "broken_link", "unlinked_mention", "resource_page",
                            "guest_contribution", "expert_quote", "data_study", "podcast",
                            "partnership", "supplier_listing", "local_sponsorship"]),
        target_page_url_=string("The specific page you would want a link from"),
        rationale_=string("Why this site would plausibly link to us"),
    ),
    category="offpage",
    cost_hint_usd=0.01,
)
async def qualify_prospect(
    ctx: ToolContext,
    domain: str,
    tactic: str,
    target_page_url: str | None = None,
    rationale: str | None = None,
) -> ToolOutcome:
    from seoos.analysis.http import SafeHttpClient
    from seoos.analysis.parser import parse_html

    site = await load_site(ctx)
    domain = domain.lower().replace("https://", "").replace("http://", "").strip("/")

    disqualified: list[str] = []
    tld = "." + domain.rsplit(".", 1)[-1]
    if tld in SUSPICIOUS_TLDS:
        disqualified.append(f"suspicious TLD {tld}")

    url = target_page_url or f"https://{domain}"
    page_signals = None
    try:
        async with SafeHttpClient() as client:
            result = await client.get(url)
        if result.ok and result.is_html:
            page_signals = parse_html(result.text, result.final_url)
            body = (page_signals.main_text or page_signals.text).lower()
            for pattern, reason in DISQUALIFY_PATTERNS:
                if re.search(pattern, body):
                    disqualified.append(reason)
    except Exception as exc:  # noqa: BLE001
        disqualified.append(f"not reachable: {exc}")

    authority = None
    if await has_connector(ctx, "moz"):
        connector = await connector_for(ctx, "moz")
        async with connector:
            metrics = await connector.url_metrics([f"https://{domain}"])
        if metrics.ok and metrics.data:
            row = metrics.data[0]
            authority = row.get("domain_authority")
            if (row.get("spam_score") or 0) > 40:
                disqualified.append(f"Moz spam score {row['spam_score']}")

    relevance = _relevance(site, page_signals)
    status = "disqualified" if disqualified else ("qualified" if relevance > 0.25 else "new")

    existing = (
        await ctx.session.execute(
            select(LinkProspect).where(
                LinkProspect.site_id == site.id,
                LinkProspect.domain == domain,
                LinkProspect.tactic == tactic,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = LinkProspect(
            org_id=ctx.org_id, site_id=site.id, domain=domain, tactic=tactic
        )
        ctx.session.add(existing)
    existing.target_page_url = target_page_url
    existing.rationale = rationale
    existing.authority = authority
    existing.relevance = relevance
    existing.status = status
    existing.disqualified_reason = "; ".join(disqualified)[:300] or None
    existing.link_likelihood = _likelihood(tactic, relevance, authority)
    existing.priority_score = round(
        (existing.link_likelihood or 0) * (relevance or 0) * ((authority or 30) / 100) * 100, 1
    )
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=(
            f"{domain}: {status}"
            + (f" ({'; '.join(disqualified)})" if disqualified else
               f", relevance {relevance:.2f}, priority {existing.priority_score}")
        ),
        data={
            "prospect_id": existing.id,
            "domain": domain,
            "status": status,
            "disqualified_reason": existing.disqualified_reason,
            "authority": authority,
            "relevance": relevance,
            "link_likelihood": existing.link_likelihood,
            "priority_score": existing.priority_score,
            "page_topic": (page_signals.title if page_signals else None),
        },
    )


def _relevance(site, signals) -> float:
    """Topical overlap between the prospect's page and the client's business.

    Relevance beats authority for link value, and it is the thing most link
    building gets backwards.
    """
    if signals is None or site is None:
        return 0.3
    theirs = {w for w in re.findall(r"[a-z]{4,}", (signals.main_text or "")[:4000].lower())}
    ours = {w for w in re.findall(r"[a-z]{4,}", (
        f"{site.name} {site.industry or ''} {site.notes or ''}"
    ).lower())}
    ours |= {w for w in re.findall(r"[a-z]{4,}", site.domain.lower())}
    if not ours or not theirs:
        return 0.3
    return round(min(len(ours & theirs) / max(len(ours), 1), 1.0), 2)


def _likelihood(tactic: str, relevance: float, authority: float | None) -> float:
    """Honest base rates. Most outreach fails, and planning as though it will
    not is how link programmes miss their targets by an order of magnitude."""
    base = {
        "unlinked_mention": 0.45,   # they already wrote about you
        "broken_link": 0.12,
        "resource_page": 0.08,
        "expert_quote": 0.25,
        "data_study": 0.15,
        "digital_pr": 0.06,
        "podcast": 0.20,
        "partnership": 0.35,
        "supplier_listing": 0.50,
        "local_sponsorship": 0.55,
        "guest_contribution": 0.10,
    }.get(tactic, 0.08)
    modifier = 0.6 + relevance
    if authority and authority > 70:
        modifier *= 0.7  # high-authority sites say no more often
    return round(min(base * modifier, 0.95), 3)


@tool(
    "offpage.find_unlinked_mentions",
    """Find pages that mention the brand without linking to it.

    The highest-converting link opportunity there is: the hard part, someone
    writing about the client, already happened.""",
    schema(
        brand_terms=array("Brand names and product names to search for", {"type": "string"}),
        limit_=integer("How many results to check", minimum=5, maximum=100, default=25),
    ),
    category="offpage",
    cost_hint_usd=0.02,
)
async def find_unlinked_mentions(
    ctx: ToolContext, brand_terms: list[str], limit: int = 25
) -> ToolOutcome:
    from seoos.analysis.http import SafeHttpClient
    from seoos.analysis.parser import parse_html

    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    candidates: list[str] = []
    for term in brand_terms[:5]:
        query = f'"{term}" -site:{site.domain}'
        for provider in ("dataforseo", "serper"):
            if not await has_connector(ctx, provider):
                continue
            connector = await connector_for(ctx, provider)
            async with connector:
                result = (
                    await connector.serp(query, depth=20)
                    if provider == "dataforseo"
                    else await connector.search(query, num=20)
                )
            if result.ok:
                candidates.extend(r["url"] for r in result.data.get("organic", []) if r.get("url"))
                break

    if not candidates:
        return ToolOutcome(
            ok=False,
            error=(
                "No SERP provider is connected, so mentions cannot be discovered "
                "automatically. Connect DataForSEO or Serper."
            ),
        )

    found: list[dict] = []
    async with SafeHttpClient() as client:
        for url in list(dict.fromkeys(candidates))[:limit]:
            try:
                result = await client.get(url)
            except Exception:  # noqa: BLE001
                continue
            if not result.ok or not result.is_html:
                continue
            signals = parse_html(result.text, result.final_url)
            text = (signals.main_text or signals.text).lower()
            mentioned = [t for t in brand_terms if t.lower() in text]
            if not mentioned:
                continue
            links_to_us = any(
                same_domain(site.domain, link.url)
                for link in signals.external_links
            )
            if links_to_us:
                continue
            context = ""
            match = re.search(
                rf"[^.]*{re.escape(mentioned[0].lower())}[^.]*\.", text
            )
            if match:
                context = match.group(0).strip()[:400]
            found.append(
                {
                    "url": result.final_url,
                    "domain": _domain(result.final_url),
                    "title": signals.title,
                    "mentions": mentioned,
                    "context": context,
                    "author": signals.author,
                    "published": signals.published_date,
                }
            )

    return ToolOutcome(
        ok=True,
        summary=f"{len(found)} unlinked mentions across {len(candidates)} results checked",
        data={"mentions": found},
    )


@tool(
    "offpage.draft_outreach",
    """Draft a personalised outreach email and queue it.

    The draft is checked before it can be sent: role addresses, template
    placeholders, missing personalisation and anything that reads as bulk are
    rejected. Outreach that gets ignored still costs the client's domain
    reputation.""",
    schema(
        prospect_id=string("The qualified prospect"),
        subject=string("Subject line, under 80 characters"),
        body=string("The full email, under 200 words"),
        specific_reference=string(
            "What you read on their site that prompted this, in your own words. "
            "This is what separates outreach from spam, and it is checked."
        ),
        contact_email_=string("Recipient address"),
        contact_name_=string("Recipient name"),
        campaign_=string("Campaign label"),
    ),
    category="offpage",
    mutates=True,
    risk="medium",
    approval_type="outreach_send",
    auto_from="autopilot",
)
async def draft_outreach(
    ctx: ToolContext,
    prospect_id: str,
    subject: str,
    body: str,
    specific_reference: str,
    contact_email: str | None = None,
    contact_name: str | None = None,
    campaign: str | None = None,
) -> ToolOutcome:
    from seoos.connectors.outreach import OutreachMessageDraft

    prospect = (
        await ctx.session.execute(
            select(LinkProspect).where(
                LinkProspect.id == prospect_id, LinkProspect.site_id == ctx.site_id
            )
        )
    ).scalar_one_or_none()
    if prospect is None:
        return ToolOutcome(ok=False, error=f"Prospect {prospect_id} not found")
    if prospect.status == "disqualified":
        raise SafetyRefusal(
            f"{prospect.domain} was disqualified: {prospect.disqualified_reason}. "
            "Contacting them is not worth the client's reputation."
        )

    email = contact_email or prospect.contact_email
    if not email:
        return ToolOutcome(
            ok=False,
            error=(
                "No contact address. Find a named person on the site or via their "
                "public author page; a role address is not worth sending to."
            ),
        )

    draft = OutreachMessageDraft(
        to_email=email,
        to_name=contact_name or prospect.contact_name,
        subject=subject,
        body=body,
        personalisation={"specific_reference": specific_reference},
    )
    problems = draft.quality_problems()
    if problems:
        return ToolOutcome(
            ok=False,
            error="This draft would not be sent: " + "; ".join(problems),
            data={"problems": problems},
        )

    thread = OutreachThread(
        org_id=ctx.org_id,
        site_id=ctx.site_id,
        prospect_id=prospect.id,
        campaign=campaign,
        subject=subject,
        angle=specific_reference[:2000],
        status="drafted",
    )
    ctx.session.add(thread)
    await ctx.session.flush()
    ctx.session.add(
        OutreachMessage(
            org_id=ctx.org_id,
            thread_id=thread.id,
            direction="out",
            step=1,
            subject=subject,
            body=body,
            personalisation={"specific_reference": specific_reference},
            status="draft",
        )
    )
    prospect.status = "queued"
    prospect.contact_email = email
    prospect.contact_name = contact_name or prospect.contact_name
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=f"Outreach to {prospect.domain} drafted and queued for approval",
        data={"thread_id": thread.id, "prospect": prospect.domain, "to": email},
    )


@tool(
    "offpage.send_outreach",
    """Send an approved outreach email through the client's own mail server.

    Never sends from platform infrastructure, never in bulk, and respects a
    per-domain daily cap.""",
    schema(thread_id=string("The approved outreach thread")),
    category="offpage",
    mutates=True,
    risk="high",
    approval_type="outreach_send",
    auto_from="autopilot",
)
async def send_outreach(ctx: ToolContext, thread_id: str) -> ToolOutcome:
    from seoos.connectors.outreach import OutreachMessageDraft, SendingGovernor

    thread = (
        await ctx.session.execute(
            select(OutreachThread).where(
                OutreachThread.id == thread_id, OutreachThread.site_id == ctx.site_id
            )
        )
    ).scalar_one_or_none()
    if thread is None:
        return ToolOutcome(ok=False, error=f"Thread {thread_id} not found")

    message = (
        await ctx.session.execute(
            select(OutreachMessage)
            .where(OutreachMessage.thread_id == thread.id, OutreachMessage.status == "draft")
            .order_by(OutreachMessage.step)
        )
    ).scalars().first()
    if message is None:
        return ToolOutcome(ok=False, error="No draft message on this thread")

    prospect = (
        await ctx.session.execute(
            select(LinkProspect).where(LinkProspect.id == thread.prospect_id)
        )
    ).scalar_one_or_none()
    if prospect is None or not prospect.contact_email:
        return ToolOutcome(ok=False, error="No recipient address")

    governor = SendingGovernor(**(ctx.extras.get("sending_limits") or {}))
    refusal = governor.check(prospect.contact_email)
    if refusal:
        return ToolOutcome(ok=False, error=f"Not sent: {refusal}")

    provider = "smtp" if await has_connector(ctx, "smtp") else "sendgrid"
    connector = await connector_for(ctx, provider)
    draft = OutreachMessageDraft(
        to_email=prospect.contact_email,
        to_name=prospect.contact_name,
        subject=message.subject or thread.subject or "",
        body=message.body,
        personalisation=message.personalisation or {},
    )
    async with connector:
        result = await connector.send(draft)

    if not result.ok:
        message.error = result.error
        await ctx.session.flush()
        return ToolOutcome(ok=False, error=result.error)

    now = datetime.now(UTC)
    message.status = "sent"
    message.sent_at = now
    message.provider_message_id = (result.data or {}).get("message_id")
    message.sent_by = ctx.agent_key
    thread.status = "sent"
    thread.step = message.step
    prospect.status = "contacted"
    prospect.last_touched_at = now
    governor.record(prospect.contact_email)
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=f"Sent to {prospect.contact_email} via {provider}",
        data={"thread_id": thread.id, "to": prospect.contact_email},
    )


@tool(
    "offpage.refuse_tactic",
    """Record that a link tactic was proposed and refused. Use this when
    anyone, including the client, asks for bought links, link exchanges or a
    private blog network, so the refusal and its reasoning are on record.""",
    schema(
        tactic=string("What was proposed"),
        requested_by_=string("Who asked"),
    ),
    category="offpage",
)
async def refuse_tactic(ctx: ToolContext, tactic: str, requested_by: str = "unknown") -> ToolOutcome:
    from seoos.services.audit_log import record_event

    await record_event(
        ctx.session,
        org_id=ctx.org_id, site_id=ctx.site_id,
        action="tactic.refused", object_type="policy",
        actor_type="agent", actor_id=ctx.agent_key,
        summary=f"Refused: {tactic} (requested by {requested_by})",
        severity=1,
    )
    return ToolOutcome(
        ok=True,
        summary=f"Refused and logged: {tactic}",
        data={
            "refused": tactic,
            "reason": (
                "Link schemes breach search engine guidelines. The downside is a "
                "manual action that removes the site from results, and it is not "
                "recoverable quickly. Earned coverage is slower and it holds."
            ),
            "instead": [
                "publish something genuinely worth citing, then pitch it",
                "convert unlinked brand mentions, which already exist",
                "supplier, partner and association listings the client qualifies for",
                "expert commentary to journalists who are already writing the story",
            ],
        },
    )


def _domain(url: str) -> str:
    return (urlparse(url).hostname or "").lower()
