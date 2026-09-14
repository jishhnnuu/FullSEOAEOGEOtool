"""AEO/GEO checks: will an answer engine quote this page?

Classic SEO asks whether a page can rank. Answer engines retrieve passages
and attribute them, which rewards different properties: a direct answer near
the top, specific verifiable facts, clean structure, an identifiable author,
and a crawler that is actually allowed in. These checks measure exactly those.
"""

from __future__ import annotations

import re

from seoos.analysis.crawler import CrawledPage, CrawlReport
from seoos.analysis.findings import FindingDraft
from seoos.analysis.parser import PageSignals

# The crawlers that feed answer engines and AI training. A site that blocks
# all of them has opted out of AI search, which is a legitimate choice but
# almost never a deliberate one.
AI_CRAWLERS = {
    "GPTBot": "OpenAI training",
    "OAI-SearchBot": "ChatGPT search results",
    "ChatGPT-User": "ChatGPT browsing on a user's behalf",
    "ClaudeBot": "Anthropic training",
    "Claude-SearchBot": "Claude search results",
    "Claude-User": "Claude browsing on a user's behalf",
    "PerplexityBot": "Perplexity index",
    "Perplexity-User": "Perplexity browsing on a user's behalf",
    "Google-Extended": "Gemini grounding and training",
    "Applebot-Extended": "Apple Intelligence",
    "Bingbot": "Copilot and Bing",
    "CCBot": "Common Crawl, which feeds many models",
    "meta-externalagent": "Meta AI",
    "Bytespider": "TikTok and Doubao",
    "Amazonbot": "Alexa and Rufus",
}

# Crawlers worth allowing if the client wants AI visibility at all. Blocking
# a training-only crawler is defensible; blocking a retrieval crawler means
# no citations.
RETRIEVAL_CRAWLERS = {
    "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User",
    "PerplexityBot", "Perplexity-User", "Google-Extended", "Bingbot",
}

_DIRECT_ANSWER_MIN_CHARS = 120
_DIRECT_ANSWER_MAX_CHARS = 700


def check_aeo(page: CrawledPage) -> list[FindingDraft]:
    signals = page.signals
    if signals is None or not page.ok:
        return []
    out: list[FindingDraft] = []
    url = page.url
    score = score_page_aeo(signals)

    if score["direct_answer"] < 0.5 and signals.question_headings:
        out.append(
            FindingDraft(
                "no_direct_answer", url,
                "The page raises a question but does not answer it plainly near the top",
                evidence={
                    "questions": signals.question_headings[:5],
                    "first_paragraph": signals.first_paragraph[:300],
                },
                auto_fix_payload={"questions": signals.question_headings[:5]},
            )
        )

    if not signals.stat_sentences and not signals.definition_sentences and signals.word_count > 400:
        out.append(
            FindingDraft(
                "no_citable_facts", url,
                "No specific figures, dates or definitions a model could quote",
                evidence={"word_count": signals.word_count},
            )
        )

    if not signals.author and signals.word_count > 500:
        out.append(
            FindingDraft(
                "no_author_attribution", url,
                "Substantial content with no identifiable author",
            )
        )

    return out


def check_site_aeo(report: CrawlReport, *, llms_txt_present: bool = False) -> list[FindingDraft]:
    out: list[FindingDraft] = []
    robots = report.robots_txt or ""

    blocked = blocked_ai_crawlers(robots)
    blocked_retrieval = [c for c in blocked if c in RETRIEVAL_CRAWLERS]
    if blocked_retrieval:
        out.append(
            FindingDraft(
                "ai_crawler_blocked", None,
                f"{len(blocked_retrieval)} retrieval crawlers are disallowed in robots.txt",
                evidence={
                    "blocked": blocked_retrieval,
                    "effect": [AI_CRAWLERS.get(c, "") for c in blocked_retrieval],
                    "all_blocked": blocked,
                },
                affected_urls=[report.base_url],
                auto_fix_payload={"allow": blocked_retrieval},
            )
        )

    if not llms_txt_present:
        out.append(
            FindingDraft(
                "missing_llms_txt", None,
                "No /llms.txt to tell answer engines what matters on this site",
                affected_urls=[report.base_url],
            )
        )

    has_org_schema = any(
        "Organization" in (p.signals.schema_types if p.signals else [])
        or "LocalBusiness" in (p.signals.schema_types if p.signals else [])
        for p in report.ok_pages
    )
    if not has_org_schema:
        out.append(
            FindingDraft(
                "entity_unclear", None,
                "No Organization or LocalBusiness markup anywhere on the site",
                affected_urls=[report.base_url],
            )
        )

    return out


def blocked_ai_crawlers(robots_txt: str) -> list[str]:
    """Which known AI crawlers does this robots.txt disallow from the root?"""
    if not robots_txt:
        return []
    blocked: list[str] = []
    current_agents: list[str] = []
    disallows: dict[str, list[str]] = {}

    for raw in robots_txt.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            current_agents = []
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            current_agents.append(value)
        elif key == "disallow" and current_agents:
            for agent in current_agents:
                disallows.setdefault(agent.lower(), []).append(value)

    for crawler in AI_CRAWLERS:
        rules = disallows.get(crawler.lower())
        if rules is None:
            rules = disallows.get("*")
            if rules is None:
                continue
        if any(rule == "/" for rule in rules):
            blocked.append(crawler)
    return blocked


def score_page_aeo(signals: PageSignals) -> dict:
    """A 0-100 citability score with its components exposed.

    A single opaque number is useless to a client. Each component maps to a
    specific fix, so the score doubles as a work list.
    """
    direct = _direct_answer_score(signals)
    structure = _structure_score(signals)
    facts = min(len(signals.stat_sentences) / 3.0, 1.0) * 0.6 + min(
        len(signals.definition_sentences) / 2.0, 1.0
    ) * 0.4
    authority = 0.0
    if signals.author:
        authority += 0.4
    if signals.published_date or signals.modified_date:
        authority += 0.3
    if any(t in signals.schema_types for t in ("Article", "NewsArticle", "BlogPosting")):
        authority += 0.3

    schema = 0.0
    if signals.schema_types:
        schema += 0.5
    if signals.has_faq_schema:
        schema += 0.3
    if any(t in signals.schema_types for t in ("HowTo", "Organization", "LocalBusiness", "Product")):
        schema += 0.2

    extractability = 0.0
    if signals.lists >= 2:
        extractability += 0.3
    if signals.tables >= 1:
        extractability += 0.2
    if signals.has_toc:
        extractability += 0.2
    if 300 <= signals.word_count <= 3000:
        extractability += 0.3

    components = {
        "direct_answer": round(direct, 2),
        "structure": round(structure, 2),
        "citable_facts": round(min(facts, 1.0), 2),
        "authority_signals": round(min(authority, 1.0), 2),
        "schema": round(min(schema, 1.0), 2),
        "extractability": round(min(extractability, 1.0), 2),
    }
    weights = {
        "direct_answer": 0.28,
        "citable_facts": 0.22,
        "structure": 0.16,
        "authority_signals": 0.16,
        "schema": 0.10,
        "extractability": 0.08,
    }
    total = sum(components[k] * w for k, w in weights.items()) * 100
    components["score"] = round(total, 1)
    components["word_count"] = signals.word_count
    return components


def _direct_answer_score(signals: PageSignals) -> float:
    """Does the page state its answer early, in a quotable span?"""
    opener = signals.first_paragraph or ""
    if not opener:
        return 0.0
    score = 0.0
    if _DIRECT_ANSWER_MIN_CHARS <= len(opener) <= _DIRECT_ANSWER_MAX_CHARS:
        score += 0.45
    elif len(opener) > _DIRECT_ANSWER_MIN_CHARS:
        score += 0.2

    # An answer that starts by restating the question as a statement is the
    # shape retrieval systems quote most reliably.
    if signals.h1:
        topic_words = {w.lower() for w in re.findall(r"\w{4,}", signals.h1[0])}
        opener_words = {w.lower() for w in re.findall(r"\w{4,}", opener[:200])}
        if topic_words and len(topic_words & opener_words) / len(topic_words) > 0.3:
            score += 0.3
    if re.search(r"\b(is|are|means|refers to|involves)\b", opener[:220], re.I):
        score += 0.25
    return min(score, 1.0)


def _structure_score(signals: PageSignals) -> float:
    score = 0.0
    if signals.h1:
        score += 0.25
    h2s = [t for lvl, t in signals.headings if lvl == 2]
    if len(h2s) >= 3:
        score += 0.3
    elif h2s:
        score += 0.15
    if signals.question_headings:
        score += 0.25
    levels = [lvl for lvl, _ in signals.headings]
    if levels and all(b - a <= 1 for a, b in zip(levels, levels[1:], strict=False)):
        score += 0.2
    return min(score, 1.0)


def build_llms_txt(site_name: str, description: str, sections: dict[str, list[dict]]) -> str:
    """Generate an llms.txt.

    The format is a plain markdown index: a title, a short description, then
    sections of links with one-line summaries. Keeping it small is the point;
    a dump of every URL is no more useful to a model than a sitemap.
    """
    lines = [f"# {site_name}", "", f"> {description}", ""]
    for section, entries in sections.items():
        lines.append(f"## {section}")
        lines.append("")
        for entry in entries:
            summary = entry.get("summary", "").strip()
            lines.append(f"- [{entry['title']}]({entry['url']})" + (f": {summary}" if summary else ""))
        lines.append("")
    return "\n".join(lines).strip() + "\n"
