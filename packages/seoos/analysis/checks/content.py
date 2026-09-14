"""Content checks: on-page fundamentals, substance and machine-writing tells.

The AI-pattern detection matters more than it looks. The platform generates
content; if it cannot recognise its own worst habits it will publish them at
scale under a client's name, which is exactly the failure mode search engines
built the scaled-content-abuse policy to catch.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from seoos.analysis.crawler import CrawledPage, CrawlReport
from seoos.analysis.findings import FindingDraft

TITLE_MIN, TITLE_MAX = 25, 62
META_MIN, META_MAX = 110, 165
THIN_WORDS = 250
STALE_DAYS = 545

# Phrases that mark machine-written prose. Each one is individually
# defensible: they are all filler that a person editing their own work would
# cut, which is why they survive only in unedited generated text.
AI_TELLS = (
    "delve into", "in today's fast-paced", "in today's digital", "it's important to note",
    "it is important to note", "unlock the power", "unlock your", "elevate your",
    "seamless integration", "seamlessly", "robust solution", "game-changer",
    "in conclusion", "to sum up", "navigating the", "the landscape of",
    "a testament to", "look no further", "dive deep", "embark on a journey",
    "when it comes to", "at the end of the day", "not only ... but also",
    "plays a crucial role", "plays a vital role", "cannot be overstated",
    "in the realm of", "harness the power", "tapestry of", "ever-evolving",
    "leverage", "leveraging", "utilize", "utilizing", "furthermore,", "moreover,",
    "additionally,", "in essence", "ultimately,",
)
DASH_RE = re.compile(r"[–—]")
HEDGE_RE = re.compile(
    r"\b(may|might|could|can|often|typically|generally|usually|potentially)\b", re.I
)
SENTENCE_RE = re.compile(r"[^.!?]+[.!?]")


def check_content(page: CrawledPage, *, is_ymyl: bool = False) -> list[FindingDraft]:
    signals = page.signals
    if signals is None or not page.ok:
        return []
    out: list[FindingDraft] = []
    url = page.url

    title = (signals.title or "").strip()
    if not title:
        out.append(FindingDraft("title_missing", url, "No title tag"))
    elif len(title) > TITLE_MAX:
        out.append(
            FindingDraft("title_too_long", url, f"{len(title)} characters",
                         evidence={"title": title})
        )
    elif len(title) < TITLE_MIN:
        out.append(
            FindingDraft("title_too_short", url, f"{len(title)} characters",
                         evidence={"title": title})
        )

    meta = (signals.meta_description or "").strip()
    if not meta:
        out.append(FindingDraft("meta_description_missing", url, "No meta description"))

    if not signals.h1:
        out.append(FindingDraft("h1_missing", url, "No H1 on the page"))
    elif len(signals.h1) > 1:
        out.append(
            FindingDraft("h1_multiple", url, f"{len(signals.h1)} H1 elements",
                         evidence={"h1s": signals.h1[:5]})
        )

    levels = [lvl for lvl, _ in signals.headings]
    for previous, current in zip(levels, levels[1:], strict=False):
        if current - previous > 1:
            out.append(
                FindingDraft(
                    "heading_hierarchy_broken", url,
                    f"Heading jumps from H{previous} to H{current}",
                    evidence={"outline": signals.headings[:20]},
                )
            )
            break

    if signals.word_count < THIN_WORDS and _looks_like_content_page(page):
        out.append(
            FindingDraft(
                "thin_content", url, f"{signals.word_count} words of body content",
                evidence={"word_count": signals.word_count},
            )
        )

    if not signals.internal_links:
        out.append(FindingDraft("no_internal_links_out", url, "No internal links in the body"))

    missing_alt = [i.src for i in signals.images if i.alt is None]
    if missing_alt:
        out.append(
            FindingDraft(
                "image_alt_missing", url,
                f"{len(missing_alt)} images have no alt attribute",
                evidence={"examples": missing_alt[:8], "count": len(missing_alt)},
                auto_fix_payload={"images": missing_alt[:50]},
            )
        )

    legacy = [i.src for i in signals.images if i.extension in ("jpg", "jpeg", "png", "gif")]
    if len(legacy) >= 3:
        out.append(
            FindingDraft(
                "image_legacy_format", url,
                f"{len(legacy)} images in legacy formats",
                evidence={"examples": legacy[:8]},
            )
        )

    no_dims = [i.src for i in signals.images if not (i.width and i.height)]
    if len(no_dims) >= 3:
        out.append(
            FindingDraft(
                "image_no_dimensions", url,
                f"{len(no_dims)} images have no width/height",
                evidence={"examples": no_dims[:8]},
            )
        )

    stale = _staleness(signals)
    if stale is not None and stale > STALE_DAYS:
        out.append(
            FindingDraft(
                "content_stale", url, f"Last updated about {stale // 30} months ago",
                evidence={"days_since_update": stale},
            )
        )

    if is_ymyl and not signals.author:
        out.append(
            FindingDraft(
                "ymyl_no_credentials", url,
                "Health, legal or financial content with no named author or reviewer",
            )
        )

    text = signals.main_text or signals.text
    if _needs_disclosure(signals, text) and not _has_disclosure(text):
        out.append(
            FindingDraft(
                "missing_disclosure", url,
                "Monetised outbound links with no visible disclosure",
                evidence={"signals": _disclosure_evidence(signals, text)},
            )
        )

    return out


# Disclosure detection. The word "sponsored" appearing anywhere on a page is
# not evidence of an affiliate relationship: plenty of legitimate pages use it
# in other senses. The check requires an actual monetised link, or an explicit
# statement of a commercial relationship, before it asks for a disclosure.
_AFFILIATE_URL_MARKERS = (
    "tag=", "aff_id=", "affid=", "?ref=", "&ref=", "/go/", "/recommends/",
    "utm_medium=affiliate", "shareasale.com", "awin1.com", "cj.com",
    "impact.com", "clickbank", "amzn.to", "partnerize", "rakuten",
)
_COMMERCIAL_PHRASES = (
    "we earn a commission", "we may earn", "earn a small commission",
    "affiliate link", "affiliate links", "paid partnership",
    "this post is sponsored", "sponsored by", "in partnership with",
)
_DISCLOSURE_PHRASES = (
    "we may earn", "we earn a commission", "affiliate disclosure",
    "as an amazon associate", "paid partnership", "sponsored post",
    "this page contains affiliate", "advertiser disclosure",
    "disclosure:", "disclaimer:",
)


def _needs_disclosure(signals, text: str) -> bool:
    lowered = (text or "").lower()
    monetised_links = [
        link for link in signals.external_links
        if "sponsored" in link.rel
        or any(marker in link.url.lower() for marker in _AFFILIATE_URL_MARKERS)
    ]
    if len(monetised_links) >= 2:
        return True
    return any(phrase in lowered for phrase in _COMMERCIAL_PHRASES)


def _has_disclosure(text: str) -> bool:
    lowered = (text or "").lower()
    return any(phrase in lowered for phrase in _DISCLOSURE_PHRASES)


def _disclosure_evidence(signals, text: str) -> dict:
    lowered = (text or "").lower()
    return {
        "monetised_links": [
            link.url for link in signals.external_links
            if "sponsored" in link.rel
            or any(marker in link.url.lower() for marker in _AFFILIATE_URL_MARKERS)
        ][:5],
        "phrases": [p for p in _COMMERCIAL_PHRASES if p in lowered][:3],
    }


def check_site_content(report: CrawlReport) -> list[FindingDraft]:
    out: list[FindingDraft] = []
    titles: dict[str, list[str]] = {}
    metas: dict[str, list[str]] = {}

    for page in report.indexable_pages:
        signals = page.signals
        if signals is None:
            continue
        if signals.title:
            titles.setdefault(signals.title.strip().lower(), []).append(page.url)
        if signals.meta_description:
            metas.setdefault(signals.meta_description.strip().lower(), []).append(page.url)

    for title, urls in titles.items():
        if len(urls) > 1:
            out.append(
                FindingDraft(
                    "duplicate_title", urls[0],
                    f"{len(urls)} pages share the title {title[:80]!r}",
                    affected_urls=urls,
                )
            )
    for urls in metas.values():
        if len(urls) > 1:
            out.append(
                FindingDraft(
                    "duplicate_meta_description", urls[0],
                    f"{len(urls)} pages share the same meta description",
                    affected_urls=urls,
                )
            )
    return out


def ai_pattern_score(text: str) -> dict:
    """0-100, where 100 means no machine-writing tells detected.

    Used as a publication gate: content below the threshold goes back to the
    humaniser rather than to the client.
    """
    if not text or len(text) < 200:
        return {"score": 100.0, "hits": [], "dashes": 0, "note": "too short to assess"}

    lowered = text.lower()
    hits = [phrase for phrase in AI_TELLS if phrase in lowered]
    dashes = len(DASH_RE.findall(text))

    sentences = [s.strip() for s in SENTENCE_RE.findall(text) if s.strip()]
    lengths = [len(s.split()) for s in sentences] or [0]
    mean = sum(lengths) / len(lengths)
    variance = sum((n - mean) ** 2 for n in lengths) / len(lengths)
    # Uniform sentence length is one of the most reliable tells; human prose
    # varies a lot more than generated prose does.
    burstiness = variance ** 0.5

    words = lowered.split()
    hedges = len(HEDGE_RE.findall(lowered))
    hedge_rate = hedges / max(len(words), 1) * 1000

    starts = [s.split()[0].lower() for s in sentences if s.split()]
    repeated_starts = len(starts) - len(set(starts))

    penalty = 0.0
    penalty += min(len(hits) * 6, 40)
    penalty += min(dashes * 4, 20)
    penalty += 15 if burstiness < 4.0 and len(sentences) > 8 else 0
    penalty += min(max(hedge_rate - 12, 0) * 1.2, 12)
    penalty += min(repeated_starts * 1.5, 12)

    return {
        "score": round(max(0.0, 100.0 - penalty), 1),
        "hits": hits[:15],
        "dashes": dashes,
        "sentence_length_variance": round(burstiness, 2),
        "hedge_rate_per_1000": round(hedge_rate, 1),
        "repeated_sentence_starts": repeated_starts,
    }


def readability(text: str) -> dict:
    """Flesch reading ease, plus the inputs so the number can be argued with."""
    sentences = [s for s in SENTENCE_RE.findall(text) if s.strip()]
    words = re.findall(r"[A-Za-z']+", text)
    if not sentences or not words:
        return {"score": None, "grade": None, "words": len(words), "sentences": len(sentences)}
    syllables = sum(_syllables(w) for w in words)
    words_per_sentence = len(words) / len(sentences)
    syllables_per_word = syllables / len(words)
    score = 206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word
    grade = 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59
    return {
        "score": round(score, 1),
        "grade": round(grade, 1),
        "words": len(words),
        "sentences": len(sentences),
        "words_per_sentence": round(words_per_sentence, 1),
    }


def _syllables(word: str) -> int:
    word = word.lower().strip("'")
    if len(word) <= 3:
        return 1
    word = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", word)
    word = re.sub(r"^y", "", word)
    return max(len(re.findall(r"[aeiouy]{1,2}", word)), 1)


def _looks_like_content_page(page: CrawledPage) -> bool:
    """Do not flag a contact form or a login page for being short."""
    path = (page.url or "").lower()
    if any(seg in path for seg in ("/contact", "/login", "/thank", "/cart", "/search")):
        return False
    signals = page.signals
    return bool(signals and signals.word_count > 0 and (signals.h1 or signals.headings))


def _staleness(signals) -> int | None:
    raw = signals.modified_date or signals.published_date
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            parsed = datetime.strptime(raw[:len(fmt) + 6] if "%z" in fmt else raw[:10], fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return (datetime.now(UTC) - parsed).days
        except ValueError:
            continue
    return None


def freshness_window(days: int) -> timedelta:
    return timedelta(days=days)
