#!/usr/bin/env python3
"""Measure AI crawler access and answer readiness across a sample of sites.

Why this script exists, and why it is cheap enough to run:

The audit uses no language model and no data vendor, so a run costs nothing
but bandwidth. Every competitor measuring the same thing pays a model call or
a data credit per site, which is why none of them publishes a dataset. This is
the one piece of marketing that is also a proof of the architecture.

Politeness matters more than volume here. Two requests per site, robots.txt
and the homepage, with a delay between sites. Nothing is crawled beyond the
homepage, nothing is stored about anyone, and the output is aggregate counts
plus the per-site fields anyone could check themselves in a browser.

    python3 scripts/research_crawler_access.py --input scripts/data/sample.txt \
        --output apps/web/src/content/research-data.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))

from seoos.analysis.checks.aeo import blocked_ai_crawlers  # noqa: E402
from seoos.analysis.http import SafeHttpClient  # noqa: E402
from seoos.analysis.parser import parse_html  # noqa: E402

# The agents whose access decides whether a brand can appear in an AI answer
# today. Training-only crawlers are deliberately excluded: refusing those is a
# defensible business decision, while refusing these makes you invisible.
RETRIEVAL_AGENTS = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended",
]


@dataclass
class SiteResult:
    domain: str
    reachable: bool = False
    status: int = 0
    error: str | None = None
    has_robots: bool = False
    blocked_agents: list[str] = field(default_factory=list)
    names_agents: int = 0
    has_llms_txt: bool = False
    has_sitemap_directive: bool = False
    # Answer readiness signals, all from the served HTML with no JavaScript.
    words: int = 0
    has_title: bool = False
    has_description: bool = False
    jsonld_blocks: int = 0
    has_organization: bool = False
    has_author: bool = False
    question_headings: int = 0


def looks_like_llms_txt(status: int, body: str | None, content_type: str = "") -> bool:
    """Whether this response is actually an llms.txt, rather than a 200 that is not.

    A status check alone is not enough and the difference is not academic. A
    first pass of this script reported that 70% of a SaaS sample published an
    llms.txt, which would have been a striking and completely wrong headline.
    Plenty of sites answer 200 at any path with their HTML shell, a soft 404 or
    a bot-check page, and one of them answered 403 to a browser and 200 to this
    client within the same minute.

    A false positive is more expensive than a miss, and it is far more
    expensive in something published as research: one wrong number and the
    whole dataset is worth nothing. So the body has to look like the file it
    claims to be. The convention is Markdown beginning with a level-one
    heading, so that is what is required, along with the absence of any HTML
    shell.
    """
    if status != 200 or not body:
        return False
    # Served as text. A site answering with text/html at this path is serving a
    # page, not a file, whatever the status line says. This is what separated a
    # genuine llms.txt from a bot-check page that answered 403 to a browser and
    # 200 to this client within the same minute.
    if content_type and "text/plain" not in content_type.lower():
        return False
    text = body.strip()
    if not text:
        return False
    lowered = text[:2000].lower()
    if "<!doctype" in lowered or "<html" in lowered or "<body" in lowered:
        return False
    # The convention is a Markdown document whose first line names the site.
    if not text.startswith("#"):
        return False
    # A single heading and nothing else is a placeholder, not a map.
    return len(text) > 80


async def inspect(client: SafeHttpClient, domain: str) -> SiteResult:
    """Two requests, no crawl. Whatever fails is recorded rather than retried."""
    result = SiteResult(domain=domain)
    origin = f"https://{domain}"

    try:
        # robots.txt itself is fetched without a robots check, because
        # deciding whether to read robots.txt by reading robots.txt does not
        # terminate.
        robots = await client.get(f"{origin}/robots.txt", check_robots=False)
        body = robots.text if robots.status == 200 else ""
        result.has_robots = robots.status == 200 and bool(body.strip())
        if result.has_robots:
            lowered = body.lower()
            result.has_sitemap_directive = "sitemap:" in lowered
            result.names_agents = sum(
                1 for agent in RETRIEVAL_AGENTS if f"user-agent: {agent.lower()}" in lowered
            )
            result.blocked_agents = [a for a in blocked_ai_crawlers(body) if a in RETRIEVAL_AGENTS]
    except Exception as exc:  # noqa: BLE001 - a failed fetch is data, not a crash
        result.error = str(exc)[:120]

    try:
        llms = await client.get(f"{origin}/llms.txt", check_robots=False)
        result.has_llms_txt = looks_like_llms_txt(
            llms.status, llms.text, llms.headers.get("content-type", "")
        )
    except Exception:  # noqa: BLE001
        result.has_llms_txt = False

    try:
        home = await client.get(origin)
        result.status = home.status
        result.reachable = 200 <= home.status < 300
        if result.reachable and home.text:
            page = parse_html(home.text, origin)
            result.words = page.word_count
            result.has_title = bool(page.title)
            result.has_description = bool(page.meta_description)
            result.jsonld_blocks = len(page.jsonld)
            types = {
                str(block.get("@type", "")).lower()
                for block in page.jsonld
                if isinstance(block, dict)
            }
            result.has_organization = bool(types & {"organization", "localbusiness", "corporation"})
            result.has_author = bool(page.author)
            result.question_headings = sum(1 for _, text in page.headings if "?" in text)
    except Exception as exc:  # noqa: BLE001
        result.error = result.error or str(exc)[:120]

    return result


def summarise(results: list[SiteResult]) -> dict:
    """Aggregate counts, with the denominator stated for every rate.

    Coverage before conclusions: every percentage here divides by the number
    of sites that actually answered, and that number is in the output. A rate
    over an unstated denominator is the thing this product exists not to do.
    """
    reachable = [r for r in results if r.reachable]
    n = len(reachable)
    if n == 0:
        return {"sampled": len(results), "reachable": 0}

    blocking = [r for r in reachable if r.blocked_agents]
    per_agent = {
        agent: sum(1 for r in reachable if agent in r.blocked_agents) for agent in RETRIEVAL_AGENTS
    }

    def pct(count: int) -> float:
        return round(count * 100 / n, 1)

    return {
        "sampled": len(results),
        "reachable": n,
        "unreachable": len(results) - n,
        "generated_at": datetime.now(UTC).date().isoformat(),
        "blocking_any_retrieval_agent": {"count": len(blocking), "pct": pct(len(blocking))},
        "blocked_per_agent": {a: {"count": c, "pct": pct(c)} for a, c in per_agent.items()},
        "no_robots_txt": {
            "count": sum(1 for r in reachable if not r.has_robots),
            "pct": pct(sum(1 for r in reachable if not r.has_robots)),
        },
        "names_no_agent_explicitly": {
            "count": sum(1 for r in reachable if r.names_agents == 0),
            "pct": pct(sum(1 for r in reachable if r.names_agents == 0)),
        },
        "has_llms_txt": {
            "count": sum(1 for r in reachable if r.has_llms_txt),
            "pct": pct(sum(1 for r in reachable if r.has_llms_txt)),
        },
        "no_sitemap_directive": {
            "count": sum(1 for r in reachable if not r.has_sitemap_directive),
            "pct": pct(sum(1 for r in reachable if not r.has_sitemap_directive)),
        },
        "thin_served_html": {
            "count": sum(1 for r in reachable if r.words < 200),
            "pct": pct(sum(1 for r in reachable if r.words < 200)),
            "note": "Fewer than 200 words in the HTML before any JavaScript runs.",
        },
        "almost_no_served_html": {
            "count": sum(1 for r in reachable if r.words < 50),
            "pct": pct(sum(1 for r in reachable if r.words < 50)),
        },
        "no_structured_data": {
            "count": sum(1 for r in reachable if r.jsonld_blocks == 0),
            "pct": pct(sum(1 for r in reachable if r.jsonld_blocks == 0)),
        },
        "no_organization_entity": {
            "count": sum(1 for r in reachable if not r.has_organization),
            "pct": pct(sum(1 for r in reachable if not r.has_organization)),
        },
        "no_meta_description": {
            "count": sum(1 for r in reachable if not r.has_description),
            "pct": pct(sum(1 for r in reachable if not r.has_description)),
        },
        "median_served_words": sorted(r.words for r in reachable)[n // 2],
    }


async def run(domains: list[str], delay: float) -> tuple[list[SiteResult], dict]:
    results: list[SiteResult] = []
    async with SafeHttpClient(timeout=12.0) as client:
        for index, domain in enumerate(domains, start=1):
            result = await inspect(client, domain)
            results.append(result)
            state = "ok" if result.reachable else f"unreachable ({result.error or result.status})"
            blocked = f", blocks {len(result.blocked_agents)}" if result.blocked_agents else ""
            print(f"  [{index}/{len(domains)}] {domain}: {state}{blocked}", flush=True)
            if index < len(domains):
                await asyncio.sleep(delay)
    return results, summarise(results)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--delay", type=float, default=0.4, help="Seconds between sites.")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    domains = [
        line.strip().lower().removeprefix("https://").removeprefix("http://").rstrip("/")
        for line in args.input.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    if args.limit:
        domains = domains[: args.limit]

    print(f"Reading {len(domains)} domains, two requests each.")
    results, summary = asyncio.run(run(domains, args.delay))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {"summary": summary, "sites": [asdict(r) for r in results]},
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    print(f"\nWrote {args.output}")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
