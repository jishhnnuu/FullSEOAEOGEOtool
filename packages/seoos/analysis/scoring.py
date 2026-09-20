"""Scores.

A score is only useful if the client can see what moved it and what to do
about it. Every score here decomposes into weighted components, each of which
maps to findings the platform already knows how to fix.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from seoos.analysis.findings import FindingDraft

SEVERITY_WEIGHT = {"critical": 12.0, "high": 6.0, "medium": 2.5, "low": 1.0, "info": 0.25}

# Which categories roll into which headline score, and how heavily.
HEALTH_WEIGHTS = {
    "technical": 0.26,
    "content": 0.22,
    "performance": 0.16,
    "schema": 0.10,
    "ux": 0.10,
    "analytics": 0.08,
    "compliance": 0.08,
}
AEO_WEIGHTS = {"aeo": 0.70, "schema": 0.18, "content": 0.12}
AUTHORITY_WEIGHTS = {"offpage": 0.75, "local": 0.25}


@dataclass
class ScoreBreakdown:
    """A score, and whether anything actually measured it.

    `measured` is not decoration. Authority without link data is a guess about
    the one input that defines it, and Experience without a timing run is HTML
    heuristics wearing the clothes of a performance score. Rendering either as
    a number is the failure this flag exists to prevent: it is what produced a
    false Experience 100 and a false Authority 84 before the rule existed, and
    what printed "authority 100.0" from the CLI for a site with no backlink
    source connected. The browser engine has carried this since `score.ts` was
    written; this is the server engine catching up so the two agree.
    """

    score: float
    components: dict[str, float] = field(default_factory=dict)
    penalties: dict[str, float] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    top_issues: list[dict] = field(default_factory=list)
    measured: bool = True
    unmeasured_reason: str | None = None
    unmeasured_fix: str | None = None

    def as_unmeasured(self, reason: str, fix: str) -> ScoreBreakdown:
        """Mark the score asserted rather than measured, and say why."""
        self.measured = False
        self.unmeasured_reason = reason
        self.unmeasured_fix = fix
        return self

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "components": self.components,
            "penalties": self.penalties,
            "counts": self.counts,
            "top_issues": self.top_issues,
            "measured": self.measured,
            "unmeasured_reason": self.unmeasured_reason,
            "unmeasured_fix": self.unmeasured_fix,
        }


def category_score(findings: list[FindingDraft], category: str, page_count: int = 1) -> float:
    """0-100 for one category.

    Penalty is normalised by site size, because 20 missing alt attributes on
    a 5-page site is a different problem from 20 on a 5000-page site.
    """
    relevant = [f for f in findings if f.category == category]
    if not relevant:
        return 100.0
    scale = max(page_count, 1) ** 0.5
    penalty = 0.0
    for finding in relevant:
        weight = SEVERITY_WEIGHT.get(finding.severity, 1.0)
        breadth = 1.0 + min(len(finding.affected_urls) / max(page_count, 1), 2.0)
        penalty += weight * breadth
    normalised = penalty / scale * 2.2

    # Size normalisation alone lets a single catastrophic issue hide inside a
    # large site, which is how audit tools end up reporting 98/100 for a site
    # that is returning 500s. A severity present at all caps the category.
    ceiling = 100.0
    for severity, cap in (("critical", 55.0), ("high", 78.0), ("medium", 92.0)):
        matching = [f for f in relevant if f.severity == severity]
        if matching:
            # Each additional issue at that severity lowers the cap further,
            # with diminishing effect so the score never collapses to zero on
            # a long tail.
            ceiling = min(ceiling, cap - min(len(matching) - 1, 8) * (cap * 0.04))
            break
    return round(max(0.0, min(100.0 - normalised, ceiling)), 1)


def _weighted(findings: list[FindingDraft], weights: dict[str, float], page_count: int) -> ScoreBreakdown:
    components = {cat: category_score(findings, cat, page_count) for cat in weights}
    total = sum(components[cat] * weight for cat, weight in weights.items())

    # A weighted average dilutes a critical problem into invisibility: one page
    # returning 500 on an otherwise clean site scores in the high eighties,
    # which is not how anyone would describe that site. The headline number is
    # therefore capped by the worst severity present, so "healthy" always means
    # nothing critical is outstanding.
    relevant = [f for f in findings if f.category in weights]
    if any(f.severity == "critical" for f in relevant):
        total = min(total, 69.0)
    elif any(f.severity == "high" for f in relevant):
        total = min(total, 87.0)
    counts: dict[str, int] = {}
    for finding in findings:
        if finding.category in weights:
            counts[finding.severity] = counts.get(finding.severity, 0) + 1
    top = sorted(
        (f for f in findings if f.category in weights),
        key=lambda f: f.priority_score(),
        reverse=True,
    )[:8]
    return ScoreBreakdown(
        score=round(total, 1),
        components=components,
        counts=counts,
        top_issues=[
            {
                "code": f.code,
                "title": f.title,
                "severity": f.severity,
                "url": f.url,
                "affected": len(f.affected_urls) or 1,
                "priority": f.priority_score(),
            }
            for f in top
        ],
    )


def health_score(findings: list[FindingDraft], page_count: int = 1) -> ScoreBreakdown:
    return _weighted(findings, HEALTH_WEIGHTS, page_count)


def aeo_score(findings: list[FindingDraft], page_count: int = 1, page_scores: list[float] | None = None) -> ScoreBreakdown:
    breakdown = _weighted(findings, AEO_WEIGHTS, page_count)
    if page_scores:
        # The per-page citability average is a direct measurement and should
        # dominate the deduction-based view.
        measured = sum(page_scores) / len(page_scores)
        breakdown.components["measured_citability"] = round(measured, 1)
        breakdown.score = round(breakdown.score * 0.4 + measured * 0.6, 1)
    return breakdown


def authority_score(
    findings: list[FindingDraft],
    *,
    referring_domains: int = 0,
    competitor_median_domains: int = 0,
    page_count: int = 1,
) -> ScoreBreakdown:
    breakdown = _weighted(findings, AUTHORITY_WEIGHTS, page_count)
    if competitor_median_domains > 0:
        ratio = min(referring_domains / competitor_median_domains, 2.0)
        relative = min(ratio * 50, 100)
        breakdown.components["relative_to_competitors"] = round(relative, 1)
        breakdown.score = round(breakdown.score * 0.35 + relative * 0.65, 1)
    elif referring_domains:
        # No competitor baseline: fall back to an absolute curve so the number
        # is still directionally useful and clearly labelled as such.
        absolute = min(100.0, 20 * (referring_domains ** 0.35))
        breakdown.components["absolute_domains_curve"] = round(absolute, 1)
        breakdown.score = round(breakdown.score * 0.4 + absolute * 0.6, 1)
    else:
        # Nothing here measured the link profile, and links are most of what
        # authority means. The findings still produce a number; it just has to
        # travel with the fact that its main input is missing.
        return breakdown.as_unmeasured(
            "Nothing here measured your backlink profile, and links are most of what authority means.",
            "Connect Search Console for its referring-domain sample, or a backlink provider for the full picture.",
        )
    return breakdown


def opportunity_score(
    *,
    impressions: int = 0,
    clicks: int = 0,
    position: float | None = None,
    ctr: float | None = None,
    search_volume: int = 0,
) -> float:
    """How much is available on this page if we act.

    Striking distance (positions 4 to 20) with real impressions is where the
    fastest wins live, so the curve peaks there rather than at position 1.
    """
    if position is None and not impressions:
        return 0.0
    demand = (impressions or search_volume or 0) ** 0.5

    if position is None:
        proximity = 0.4
    elif position <= 3:
        proximity = 0.25          # already winning; upside is small
    elif position <= 10:
        proximity = 1.0           # one page of movement away from real traffic
    elif position <= 20:
        proximity = 0.8
    elif position <= 50:
        proximity = 0.35
    else:
        proximity = 0.1

    ctr_gap = 0.0
    if ctr is not None and position is not None:
        expected = expected_ctr(position)
        if expected > 0 and ctr < expected * 0.6:
            ctr_gap = min((expected - ctr) / expected, 1.0)

    raw = demand * proximity * (1.0 + ctr_gap)
    return round(min(raw * 2.0, 100.0), 1)


# Position to click-through, used to spot titles that under-earn their rank.
_CTR_CURVE = {
    1: 0.271, 2: 0.152, 3: 0.099, 4: 0.071, 5: 0.053, 6: 0.041, 7: 0.033,
    8: 0.027, 9: 0.023, 10: 0.020,
}


def expected_ctr(position: float) -> float:
    rounded = max(1, int(round(position)))
    if rounded in _CTR_CURVE:
        return _CTR_CURVE[rounded]
    if rounded <= 20:
        return 0.015
    if rounded <= 50:
        return 0.005
    return 0.001


def forecast_traffic(volume: int, target_position: int) -> int:
    return int(volume * expected_ctr(target_position))
