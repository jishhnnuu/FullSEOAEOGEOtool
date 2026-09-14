"""Internal link graph analysis.

Internal linking is the highest-leverage lever most sites never pull: it is
entirely within the client's control, costs nothing, and decides how
authority and crawl attention are distributed. This computes the graph,
approximates internal PageRank, and produces concrete link suggestions
rather than "improve internal linking".
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from seoos.analysis.crawler import CrawlReport
from seoos.analysis.findings import FindingDraft

STOPWORDS = {
    "the", "and", "for", "with", "you", "your", "our", "are", "this", "that",
    "from", "how", "what", "why", "can", "all", "not", "但", "a", "an", "to",
    "of", "in", "on", "is", "it", "at", "by", "or", "be", "we", "us",
}
GENERIC_ANCHORS = {
    "click here", "here", "read more", "learn more", "more", "link",
    "this page", "this post", "find out more", "see more", "continue reading",
}


@dataclass
class LinkGraph:
    nodes: set[str] = field(default_factory=set)
    out_edges: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    in_edges: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    anchors: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    nav_edges: set[tuple[str, str]] = field(default_factory=set)

    def pagerank(self, damping: float = 0.85, iterations: int = 30) -> dict[str, float]:
        """Internal PageRank. Navigation links are down-weighted because a
        site-wide footer link tells you nothing about relative importance."""
        if not self.nodes:
            return {}
        n = len(self.nodes)
        rank = {node: 1.0 / n for node in self.nodes}
        weights: dict[tuple[str, str], float] = {}
        for source, targets in self.out_edges.items():
            for target in targets:
                weights[(source, target)] = 0.25 if (source, target) in self.nav_edges else 1.0

        for _ in range(iterations):
            incoming: dict[str, float] = dict.fromkeys(self.nodes, 0.0)
            dangling = 0.0
            for node in self.nodes:
                targets = self.out_edges.get(node, set())
                if not targets:
                    dangling += rank[node]
                    continue
                total_weight = sum(weights.get((node, t), 1.0) for t in targets) or 1.0
                for target in targets:
                    if target in incoming:
                        incoming[target] += rank[node] * weights.get((node, target), 1.0) / total_weight
            base = (1 - damping) / n + damping * dangling / n
            rank = {node: base + damping * incoming[node] for node in self.nodes}
        total = sum(rank.values()) or 1.0
        return {k: v / total for k, v in rank.items()}


def build_graph(report: CrawlReport) -> LinkGraph:
    graph = LinkGraph()
    for page in report.ok_pages:
        graph.nodes.add(page.url)
    for page in report.ok_pages:
        if page.signals is None:
            continue
        for link in page.signals.internal_links:
            target = link.url.split("#")[0]
            if target not in graph.nodes:
                continue
            graph.out_edges[page.url].add(target)
            graph.in_edges[target].add(page.url)
            if link.anchor:
                graph.anchors[target].append(link.anchor)
            if link.in_nav:
                graph.nav_edges.add((page.url, target))
    return graph


def check_link_graph(report: CrawlReport, *, money_pages: list[str] | None = None) -> list[FindingDraft]:
    graph = build_graph(report)
    out: list[FindingDraft] = []
    if not graph.nodes:
        return out

    ranks = graph.pagerank()
    median_rank = sorted(ranks.values())[len(ranks) // 2] if ranks else 0

    # Pages that matter commercially but receive little internal authority.
    for url in money_pages or []:
        if url in ranks and ranks[url] < median_rank:
            inbound = len(graph.in_edges.get(url, set()))
            out.append(
                FindingDraft(
                    "no_internal_links_out", url,
                    f"Commercially important page has only {inbound} internal links "
                    f"and below-median internal authority",
                    evidence={"pagerank": round(ranks[url], 6), "inlinks": inbound},
                    severity_override="high",
                )
            )

    generic = []
    for target, anchor_list in graph.anchors.items():
        if sum(1 for a in anchor_list if a.strip().lower() in GENERIC_ANCHORS) >= 2:
            generic.append(target)
    if generic:
        out.append(
            FindingDraft(
                "no_internal_links_out", None,
                f"{len(generic)} pages are linked mainly with generic anchor text",
                affected_urls=generic[:50],
                evidence={"examples": generic[:10]},
                severity_override="low",
            )
        )
    return out


def suggest_internal_links(
    report: CrawlReport, target_url: str, *, limit: int = 8, min_score: float = 0.12
) -> list[dict]:
    """Find pages that should link to ``target_url`` and say what to say.

    Relevance is lexical overlap between the target's topic terms and the
    candidate's body, which is crude but honest and needs no model. Pages
    that already link are excluded, as is the target itself.
    """
    target = report.pages.get(target_url)
    if target is None or target.signals is None:
        return []

    graph = build_graph(report)
    already = graph.in_edges.get(target_url, set())
    target_terms = _terms(
        " ".join([target.signals.title or ""] + target.signals.h1) + " " + target.signals.main_text[:2000]
    )
    if not target_terms:
        return []

    suggestions: list[dict] = []
    for page in report.ok_pages:
        if page.url == target_url or page.url in already or page.signals is None:
            continue
        body = page.signals.main_text
        candidate_terms = _terms(body[:6000])
        if not candidate_terms:
            continue
        overlap = target_terms & candidate_terms
        score = len(overlap) / max(len(target_terms), 1)
        if score < min_score:
            continue
        anchor = _pick_anchor(body, target.signals.title or "", overlap)
        if not anchor:
            continue
        suggestions.append(
            {
                "from_url": page.url,
                "to_url": target_url,
                "anchor_text": anchor,
                "relevance": round(score, 3),
                "shared_terms": sorted(overlap)[:8],
                "context": _context_for(body, anchor),
            }
        )

    suggestions.sort(key=lambda s: s["relevance"], reverse=True)
    return suggestions[:limit]


def _terms(text: str) -> set[str]:
    words = re.findall(r"[a-z][a-z\-']{2,}", (text or "").lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 3}


def _pick_anchor(body: str, target_title: str, overlap: set[str]) -> str | None:
    """Prefer a phrase that already exists in the source page, so the link
    can be inserted without rewriting the sentence around it."""
    title_terms = [w for w in re.findall(r"[A-Za-z][\w\-']{3,}", target_title)]
    for size in (4, 3, 2):
        for start in range(0, max(len(title_terms) - size + 1, 0)):
            phrase = " ".join(title_terms[start : start + size])
            if phrase.lower() in body.lower():
                return phrase
    for term in sorted(overlap, key=len, reverse=True)[:5]:
        match = re.search(rf"\b{re.escape(term)}\w*\b", body, re.I)
        if match:
            return match.group(0)
    return None


def _context_for(body: str, anchor: str) -> str:
    match = re.search(rf"[^.]*\b{re.escape(anchor)}\b[^.]*\.", body, re.I)
    return match.group(0).strip()[:300] if match else ""
