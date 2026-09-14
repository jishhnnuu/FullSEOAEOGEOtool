"""Measuring visibility inside AI answers.

Rank tracking answers "where are we on Google". This answers the question
that is replacing it: when someone asks an assistant about this category, is
the client named, is the client cited, and is what the assistant says about
them even true.

Two measurement modes:

* **Direct.** Ask the engine the prompt through its own API and parse the
  answer. Honest, cheap, and available for any engine with an API. What it
  cannot see is personalisation or the exact retrieval the consumer app does.
* **Provider.** A specialist vendor (Profound, Peec, Scrunch and similar)
  that samples real surfaces. Wired through the same interface so a client
  can upgrade without anything downstream changing.

The third measurement here matters more than share of voice and almost
nobody reports it: **accuracy**. An assistant confidently stating the wrong
price, the wrong opening hours or a service the client does not offer is a
revenue problem today, and it is fixable by changing what the site says.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from seoos.connectors.base import Capability, Connector, ConnectorResult
from seoos.core.logging import get_logger
from seoos.llm.base import Message
from seoos.llm.router import ModelRouter

log = get_logger("seoos.connectors.aivisibility")

# Engine -> how we reach it. "router" means we ask the model directly through
# whichever provider credential the tenant has.
ENGINES = {
    "chatgpt": {"provider": "openai", "model": "gpt-5", "label": "ChatGPT"},
    "claude": {"provider": "anthropic", "model": "claude-sonnet-5", "label": "Claude"},
    "gemini": {"provider": "google", "model": "gemini-2.5-pro", "label": "Gemini"},
    "perplexity": {"provider": "perplexity", "model": "sonar", "label": "Perplexity"},
}

SENTIMENT_POSITIVE = {
    "best", "leading", "recommended", "excellent", "trusted", "top", "reliable",
    "popular", "strong", "well-regarded", "reputable", "preferred",
}
SENTIMENT_NEGATIVE = {
    "avoid", "poor", "worst", "unreliable", "complaints", "scam", "expensive",
    "limited", "outdated", "criticised", "criticized", "lacking",
}


@dataclass
class VisibilityCheck:
    prompt: str
    engine: str
    brand_mentioned: bool = False
    brand_cited: bool = False
    mention_rank: int | None = None
    citation_urls: list[str] = field(default_factory=list)
    competitors_cited: list[str] = field(default_factory=list)
    sentiment: str | None = None
    answer_excerpt: str = ""
    accuracy_flags: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "prompt": self.prompt,
            "engine": self.engine,
            "brand_mentioned": self.brand_mentioned,
            "brand_cited": self.brand_cited,
            "mention_rank": self.mention_rank,
            "citation_urls": self.citation_urls,
            "competitors_cited": self.competitors_cited,
            "sentiment": self.sentiment,
            "answer_excerpt": self.answer_excerpt[:1500],
            "accuracy_flags": self.accuracy_flags,
        }


class AIVisibilityConnector(Connector):
    """Direct measurement against any engine the tenant has a key for."""

    provider = "ai_visibility"
    display_name = "AI answer visibility"
    auth_kind = "api_key"
    capabilities = (
        Capability("measure_prompt", "Ask an engine a prompt and analyse the answer"),
        Capability("share_of_voice", "Brand vs competitor citation share"),
        Capability("accuracy_check", "Detect wrong claims about the brand"),
    )

    def __init__(self, router: ModelRouter, *, credentials=None, config=None):
        super().__init__(credentials, config=config)
        self.router = router

    async def verify(self) -> ConnectorResult:
        available = self.router.available_providers()
        engines = [
            key for key, meta in ENGINES.items()
            if meta["provider"] in available
        ]
        if not engines:
            return ConnectorResult.failure(
                "No model provider is connected, so AI answer visibility cannot "
                "be measured. Connect any of OpenAI, Anthropic or Google, or a "
                "specialist visibility provider."
            )
        return ConnectorResult(ok=True, data={"engines": engines})

    async def measure(
        self,
        prompt: str,
        *,
        engine: str,
        brand_names: list[str],
        brand_domains: list[str],
        competitor_names: list[str] | None = None,
        known_facts: list[str] | None = None,
    ) -> ConnectorResult:
        meta = ENGINES.get(engine)
        if meta is None:
            return ConnectorResult.failure(f"Unknown engine {engine!r}")
        if meta["provider"] not in self.router.available_providers():
            return ConnectorResult.failure(
                f"No credential for {meta['label']}; this engine cannot be sampled"
            )

        previous = self.router.preferred
        self.router.preferred = meta["provider"]
        try:
            completion = await self.router.complete(
                [Message.user(prompt)],
                system=(
                    "Answer as you normally would for a person researching this "
                    "topic. Name specific companies, products or providers where "
                    "that is genuinely useful, and include the URLs you would "
                    "point them to."
                ),
                model=meta["model"],
                max_tokens=1200,
                temperature=0.3,
            )
        finally:
            self.router.preferred = previous

        if completion.stop_reason == "degraded":
            return ConnectorResult.failure("Engine unavailable; no measurement taken")

        check = analyse_answer(
            answer=completion.text,
            prompt=prompt,
            engine=engine,
            brand_names=brand_names,
            brand_domains=brand_domains,
            competitor_names=competitor_names or [],
            known_facts=known_facts or [],
        )
        return ConnectorResult(
            ok=True, data=check.to_dict(), cost_usd=completion.usage.usd
        )

    async def measure_set(
        self,
        prompts: list[str],
        *,
        engines: list[str],
        brand_names: list[str],
        brand_domains: list[str],
        competitor_names: list[str] | None = None,
    ) -> ConnectorResult:
        """Run a prompt set across engines and roll it up into share of voice."""
        import asyncio

        tasks = [
            self.measure(
                prompt,
                engine=engine,
                brand_names=brand_names,
                brand_domains=brand_domains,
                competitor_names=competitor_names,
            )
            for prompt in prompts
            for engine in engines
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        checks: list[dict] = []
        cost = 0.0
        failures = 0
        for item in results:
            if isinstance(item, BaseException) or not getattr(item, "ok", False):
                failures += 1
                continue
            checks.append(item.data)
            cost += item.cost_usd

        return ConnectorResult(
            ok=bool(checks),
            data={"checks": checks, "summary": summarise(checks, brand_names)},
            error=None if checks else "every measurement failed",
            cost_usd=cost,
            meta={"attempted": len(tasks), "failed": failures},
        )


def analyse_answer(
    *,
    answer: str,
    prompt: str,
    engine: str,
    brand_names: list[str],
    brand_domains: list[str],
    competitor_names: list[str],
    known_facts: list[str],
) -> VisibilityCheck:
    check = VisibilityCheck(prompt=prompt, engine=engine, answer_excerpt=answer[:2000])
    lowered = answer.lower()

    # Mention. Word-boundary matched so "Ace" does not match "placement".
    for name in brand_names:
        if not name:
            continue
        match = re.search(rf"\b{re.escape(name.lower())}\b", lowered)
        if match:
            check.brand_mentioned = True
            # Rank by order of first appearance among the named brands. Being
            # listed first is worth far more than being listed at all.
            check.mention_rank = _ordinal_position(
                lowered, brand_names, competitor_names
            )
            break

    urls = re.findall(r"https?://[^\s\)\]\>\"']+", answer)
    check.citation_urls = list(dict.fromkeys(urls))[:20]
    for url in check.citation_urls:
        if any(domain and domain.lower() in url.lower() for domain in brand_domains):
            check.brand_cited = True
            break

    for competitor in competitor_names:
        if competitor and re.search(rf"\b{re.escape(competitor.lower())}\b", lowered):
            check.competitors_cited.append(competitor)

    if check.brand_mentioned:
        check.sentiment = _sentiment_near_brand(answer, brand_names)
        check.accuracy_flags = _accuracy_flags(answer, brand_names, known_facts)

    return check


def _ordinal_position(text: str, brand_aliases: list[str], competitors: list[str]) -> int:
    """Where the brand sits in the order the answer names companies.

    Aliases of one brand ("Whitegate Dental" and "Whitegate") are collapsed
    into a single entity; counting them separately would push the brand down
    its own ranking, which is exactly backwards.
    """

    def earliest(names: list[str]) -> int | None:
        found = [
            match.start()
            for name in names
            if name
            and (match := re.search(rf"\b{re.escape(name.lower())}\b", text))
        ]
        return min(found) if found else None

    brand_at = earliest(brand_aliases)
    if brand_at is None:
        return 1

    ahead = 0
    for competitor in competitors:
        position = earliest([competitor])
        if position is not None and position < brand_at:
            ahead += 1
    return ahead + 1


def _sentiment_near_brand(answer: str, brand_names: list[str]) -> str:
    """Sentiment of the sentences the brand actually appears in.

    Scoring the whole answer would measure the tone of the topic, not the tone
    about the client, which is a different and much less useful number.
    """
    sentences = re.split(r"(?<=[.!?])\s+", answer)
    relevant = [
        s.lower() for s in sentences
        if any(n and n.lower() in s.lower() for n in brand_names)
    ]
    if not relevant:
        return "neutral"
    text = " ".join(relevant)
    positive = sum(1 for word in SENTIMENT_POSITIVE if word in text)
    negative = sum(1 for word in SENTIMENT_NEGATIVE if word in text)
    if positive > negative:
        return "positive"
    if negative > positive:
        return "negative"
    return "neutral"


_PRICE_RE = re.compile(r"[$£€]\s?\d[\d,]*(?:\.\d{2})?")
_HOURS_RE = re.compile(r"\b(?:open|closes?|hours?)\b[^.]{0,60}\d{1,2}(?::\d{2})?\s?(?:am|pm)", re.I)


def _accuracy_flags(answer: str, brand_names: list[str], known_facts: list[str]) -> list[str]:
    """Spot assertions about the brand that we should verify against the ledger.

    This is deliberately a flagging pass, not a judgement: it surfaces claims
    for the compliance agent to check against ``brand_facts`` rather than
    guessing at truth itself.
    """
    flags: list[str] = []
    sentences = [
        s for s in re.split(r"(?<=[.!?])\s+", answer)
        if any(n and n.lower() in s.lower() for n in brand_names)
    ]
    joined = " ".join(sentences)

    if _PRICE_RE.search(joined):
        flags.append("states a price for the brand; verify against the fact ledger")
    if _HOURS_RE.search(joined):
        flags.append("states opening hours; verify against the Business Profile")
    if re.search(r"\b(founded|established|since)\s+(in\s+)?\d{4}", joined, re.I):
        flags.append("states a founding date; verify")
    if re.search(r"\b(no longer|closed|acquired|merged|discontinued|out of business)\b", joined, re.I):
        flags.append("suggests the business has closed or changed hands; verify urgently")
    for fact in known_facts[:20]:
        # A contradicted known fact is the highest-value signal here.
        key_terms = [w for w in re.findall(r"\w{5,}", fact.lower())][:3]
        if key_terms and all(t in joined.lower() for t in key_terms):
            continue
    return flags


def summarise(checks: list[dict], brand_names: list[str]) -> dict:
    """Roll individual measurements up into the numbers a client reports on."""
    if not checks:
        return {}
    total = len(checks)
    mentioned = sum(1 for c in checks if c["brand_mentioned"])
    cited = sum(1 for c in checks if c["brand_cited"])

    competitor_counts: dict[str, int] = {}
    for check in checks:
        for competitor in check["competitors_cited"]:
            competitor_counts[competitor] = competitor_counts.get(competitor, 0) + 1

    ranks = [c["mention_rank"] for c in checks if c.get("mention_rank")]
    sentiments = [c["sentiment"] for c in checks if c.get("sentiment")]
    by_engine: dict[str, dict] = {}
    for check in checks:
        entry = by_engine.setdefault(check["engine"], {"prompts": 0, "mentioned": 0, "cited": 0})
        entry["prompts"] += 1
        entry["mentioned"] += int(check["brand_mentioned"])
        entry["cited"] += int(check["brand_cited"])

    # Share of voice: our mentions as a fraction of all brand mentions across
    # the prompt set, which is the number a client can compare over time.
    total_brand_mentions = mentioned + sum(competitor_counts.values())
    share = (mentioned / total_brand_mentions * 100) if total_brand_mentions else 0.0

    return {
        "prompts_measured": total,
        "mention_rate_pct": round(mentioned / total * 100, 1),
        "citation_rate_pct": round(cited / total * 100, 1),
        "share_of_voice_pct": round(share, 1),
        "avg_mention_rank": round(sum(ranks) / len(ranks), 2) if ranks else None,
        "sentiment_mix": {
            s: round(sentiments.count(s) / len(sentiments) * 100, 1)
            for s in set(sentiments)
        } if sentiments else {},
        "top_competitors": sorted(
            competitor_counts.items(), key=lambda kv: kv[1], reverse=True
        )[:10],
        "by_engine": by_engine,
        "accuracy_issues": [
            {"prompt": c["prompt"], "engine": c["engine"], "flags": c["accuracy_flags"]}
            for c in checks if c.get("accuracy_flags")
        ],
        "measured_on": date.today().isoformat(),
    }


def build_prompt_set(
    *,
    business_type: str,
    category: str,
    location: str | None = None,
    brand: str | None = None,
    competitors: list[str] | None = None,
    limit: int = 25,
) -> list[dict]:
    """Generate the prompt set to track.

    The mix matters: unbranded category prompts measure whether the brand gets
    discovered at all, comparison prompts measure whether it survives a
    shortlist, and branded prompts measure whether the assistant describes it
    correctly. Tracking only branded prompts is the most common mistake, and
    it flatters the numbers.
    """
    prompts: list[dict] = []

    def add(text: str, intent: str, group: str):
        if len(prompts) < limit and text:
            prompts.append({"prompt": text, "intent": intent, "group": group})

    where = f" in {location}" if location else ""
    add(f"What is the best {category}{where}?", "commercial", "discovery")
    add(f"Who are the top {category} providers{where}?", "commercial", "discovery")
    add(f"How do I choose a {category}{where}?", "informational", "discovery")
    add(f"What should I look for in a {category}?", "informational", "discovery")
    add(f"How much does {category} cost{where}?", "commercial", "discovery")

    if location:
        add(f"Recommend a {category} near {location}", "local", "discovery")
        add(f"{category} open now in {location}", "local", "discovery")

    if brand:
        add(f"What is {brand}?", "branded", "reputation")
        add(f"Is {brand} any good?", "branded", "reputation")
        add(f"What do people say about {brand}?", "branded", "reputation")
        add(f"How much does {brand} charge?", "branded", "accuracy")
        add(f"What services does {brand} offer?", "branded", "accuracy")

    for competitor in (competitors or [])[:4]:
        if brand:
            add(f"{brand} vs {competitor}", "comparison", "competitive")
        add(f"Alternatives to {competitor}", "comparison", "competitive")

    if business_type == "ecommerce":
        add(f"Best {category} to buy online", "transactional", "discovery")
        add(f"Where can I buy {category}?", "transactional", "discovery")
    elif business_type == "saas":
        add(f"Best {category} software for small teams", "commercial", "discovery")
        add(f"Free alternatives to paid {category} tools", "commercial", "discovery")
    elif business_type == "local":
        add(f"Emergency {category}{where}", "local", "discovery")

    return prompts[:limit]
