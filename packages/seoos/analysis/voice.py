"""Measured voice: what a body of text actually does, not what it feels like.

Everything here is computed from the text. No model judgement, no adjectives
invented to fill a report. That matters because the product's whole claim on
tone is that a recommendation to change it comes with evidence attached, and
an LLM asked "is this tone right" will always produce a confident answer
whether or not it has grounds for one.

The fingerprint is deliberately boring: counts, ratios and variances. The
interesting part is the comparison. A single site's numbers mean very little;
the same numbers next to the five pages that currently outrank it mean a lot.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field

_SENTENCE = re.compile(r"[.!?]+(?:\s|$)")
_WORD = re.compile(r"[A-Za-z']+")

# First person plural is the "we are a company" voice. Second person is the
# "here is what you do" voice. The ratio between them is the single most
# visible difference between a brochure and a useful page.
_WE = {"we", "our", "ours", "us", "ourselves"}
_YOU = {"you", "your", "yours", "yourself", "yourselves"}
_I = {"i", "my", "mine", "me", "myself"}

# Hedges make a sentence survivable in a legal review and useless to a reader.
_HEDGES = {
    "may", "might", "could", "perhaps", "possibly", "generally", "typically",
    "usually", "often", "sometimes", "arguably", "relatively", "fairly",
    "somewhat", "seemingly", "apparently", "potentially", "largely", "tends",
    "suggests", "appears", "likely", "presumably", "virtually", "essentially",
}

# The vocabulary that signals a page was written to fill a slot rather than to
# tell someone something. Shared with the humanizer's banned list on purpose:
# one definition of the tell, used by the checker and by the writer.
_FILLER = {
    "leverage", "seamless", "robust", "unlock", "elevate", "delve",
    "synergy", "holistic", "bespoke", "cutting-edge", "best-in-class",
    "world-class", "game-changing", "revolutionary", "innovative",
    "empower", "streamline", "optimize", "optimise", "utilize", "utilise",
    "facilitate", "transformative", "paradigm", "ecosystem", "landscape",
    "journey", "solution", "solutions", "offering", "offerings",
}

# Words that carry a fact. A page dense in these is telling you something;
# a page empty of them is describing itself.
_CONCRETE = re.compile(
    r"\b(\d+(?:\.\d+)?%|\$\d|₹\d|\d{4}|\d+(?:\.\d+)?\s?(?:x|times|hours?|days?|"
    r"weeks?|months?|years?|minutes?|seconds?|users?|customers?|clients?))\b",
    re.I,
)

_PASSIVE = re.compile(
    r"\b(?:is|are|was|were|be|been|being|get|got)\s+(?:\w+ly\s+)?(\w+ed|"
    r"built|made|done|given|taken|seen|known|shown|held|sent|kept|left|"
    r"found|told|brought|written|driven|chosen)\b",
    re.I,
)

_DASH = re.compile(r"[—–]")


@dataclass
class VoiceFingerprint:
    """The measured shape of a body of text."""

    words: int = 0
    sentences: int = 0
    paragraphs: int = 0

    sentence_len_mean: float = 0.0
    sentence_len_stdev: float = 0.0
    sentence_len_max: int = 0
    # Uniform sentence length is the second most reliable machine-writing
    # tell after the dash. A human varies; a generator does not.
    rhythm: float = 0.0

    reading_grade: float = 0.0
    lexical_density: float = 0.0

    we_per_1k: float = 0.0
    you_per_1k: float = 0.0
    i_per_1k: float = 0.0
    address: str = "impersonal"

    hedges_per_1k: float = 0.0
    filler_per_1k: float = 0.0
    concrete_per_1k: float = 0.0
    passive_ratio: float = 0.0
    question_ratio: float = 0.0
    imperative_ratio: float = 0.0
    dash_count: int = 0

    measured: bool = True
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "words": self.words,
            "sentences": self.sentences,
            "paragraphs": self.paragraphs,
            "sentence_len_mean": round(self.sentence_len_mean, 1),
            "sentence_len_stdev": round(self.sentence_len_stdev, 1),
            "sentence_len_max": self.sentence_len_max,
            "rhythm": round(self.rhythm, 2),
            "reading_grade": round(self.reading_grade, 1),
            "lexical_density": round(self.lexical_density, 3),
            "we_per_1k": round(self.we_per_1k, 1),
            "you_per_1k": round(self.you_per_1k, 1),
            "i_per_1k": round(self.i_per_1k, 1),
            "address": self.address,
            "hedges_per_1k": round(self.hedges_per_1k, 1),
            "filler_per_1k": round(self.filler_per_1k, 1),
            "concrete_per_1k": round(self.concrete_per_1k, 1),
            "passive_ratio": round(self.passive_ratio, 3),
            "question_ratio": round(self.question_ratio, 3),
            "imperative_ratio": round(self.imperative_ratio, 3),
            "dash_count": self.dash_count,
            "measured": self.measured,
            "notes": self.notes,
        }


def _syllables(word: str) -> int:
    return max(len(re.findall(r"[aeiouy]{1,2}", word.lower())), 1)


def fingerprint(text: str) -> VoiceFingerprint:
    """Measure one body of text. Below 120 words the ratios are noise, so the
    fingerprint says so rather than reporting a number nobody should trust."""
    fp = VoiceFingerprint()
    text = (text or "").strip()
    if not text:
        fp.measured = False
        fp.notes.append("No text to measure.")
        return fp

    words = _WORD.findall(text)
    fp.words = len(words)
    if fp.words < 120:
        fp.measured = False
        fp.notes.append(
            f"Only {fp.words} words. Voice ratios need about 120 before they "
            "mean anything, so these are not reported as measured."
        )

    sentences = [s for s in _SENTENCE.split(text) if s.strip()]
    fp.sentences = len(sentences)
    fp.paragraphs = len([p for p in text.split("\n\n") if p.strip()])

    lengths = [len(_WORD.findall(s)) for s in sentences if _WORD.findall(s)]
    if lengths:
        fp.sentence_len_mean = statistics.fmean(lengths)
        fp.sentence_len_stdev = statistics.pstdev(lengths) if len(lengths) > 1 else 0.0
        fp.sentence_len_max = max(lengths)
        # Coefficient of variation. Human prose usually lands between 0.45 and
        # 0.8; generated prose clusters far tighter than that.
        fp.rhythm = fp.sentence_len_stdev / fp.sentence_len_mean if fp.sentence_len_mean else 0.0

    if fp.words and lengths:
        syll = sum(_syllables(w) for w in words)
        fp.reading_grade = max(
            0.0,
            0.39 * (fp.words / len(lengths)) + 11.8 * (syll / fp.words) - 15.59,
        )
        fp.lexical_density = len({w.lower() for w in words}) / fp.words

    def per_1k(n: int) -> float:
        return (n / fp.words) * 1000 if fp.words else 0.0

    lower = [w.lower() for w in words]
    fp.we_per_1k = per_1k(sum(1 for w in lower if w in _WE))
    fp.you_per_1k = per_1k(sum(1 for w in lower if w in _YOU))
    fp.i_per_1k = per_1k(sum(1 for w in lower if w in _I))
    fp.hedges_per_1k = per_1k(sum(1 for w in lower if w in _HEDGES))
    fp.filler_per_1k = per_1k(sum(1 for w in lower if w in _FILLER))
    fp.concrete_per_1k = per_1k(len(_CONCRETE.findall(text)))

    if fp.you_per_1k > fp.we_per_1k * 1.4:
        fp.address = "reader-facing"
    elif fp.we_per_1k > fp.you_per_1k * 1.4:
        fp.address = "company-facing"
    elif fp.we_per_1k + fp.you_per_1k < 3:
        fp.address = "impersonal"
    else:
        fp.address = "balanced"

    if sentences:
        fp.passive_ratio = len(_PASSIVE.findall(text)) / len(sentences)
        fp.question_ratio = text.count("?") / len(sentences)
        starts = [s.strip().split()[0].lower() for s in sentences if s.strip().split()]
        imperatives = sum(
            1 for s in starts
            if s in {"use", "add", "check", "read", "start", "stop", "pick",
                     "write", "run", "open", "send", "make", "take", "try",
                     "set", "keep", "put", "call", "book", "get", "build"}
        )
        fp.imperative_ratio = imperatives / len(starts) if starts else 0.0

    fp.dash_count = len(_DASH.findall(text))
    return fp


# What a difference has to be before it is worth telling a client about. Set
# from the spread you see across ordinary business writing: anything smaller
# is inside the noise and would make the tool sound certain about nothing.
_MATERIAL = {
    "reading_grade": 2.0,
    "sentence_len_mean": 4.0,
    "rhythm": 0.12,
    "we_per_1k": 4.0,
    "you_per_1k": 4.0,
    "hedges_per_1k": 4.0,
    "filler_per_1k": 3.0,
    "concrete_per_1k": 3.0,
    "passive_ratio": 0.12,
}

_MEANING = {
    "reading_grade": ("reads harder than", "reads easier than"),
    "sentence_len_mean": ("uses longer sentences than", "uses shorter sentences than"),
    "rhythm": ("varies sentence length more than", "is more uniform than"),
    "we_per_1k": ("talks about itself more than", "talks about itself less than"),
    "you_per_1k": ("addresses the reader more than", "addresses the reader less than"),
    "hedges_per_1k": ("hedges more than", "hedges less than"),
    "filler_per_1k": ("uses more marketing filler than", "uses less marketing filler than"),
    "concrete_per_1k": ("carries more specifics than", "carries fewer specifics than"),
    "passive_ratio": ("uses more passive voice than", "uses less passive voice than"),
}


def compare(site: VoiceFingerprint, rivals: list[VoiceFingerprint]) -> dict:
    """Compare one site's voice against the pages it competes with.

    Returns only differences big enough to act on, each carrying the two
    numbers behind it. A recommendation without both numbers is an opinion,
    and this product does not ship opinions as findings.
    """
    usable = [r for r in rivals if r.measured]
    if not site.measured:
        return {
            "measured": False,
            "reason": "Not enough text on the client's own pages to measure a voice.",
            "differences": [],
            "sample_size": len(usable),
        }
    if len(usable) < 3:
        return {
            "measured": False,
            "reason": (
                f"Only {len(usable)} comparable pages could be measured. Three is "
                "the floor for calling a difference real rather than one rival's habit."
            ),
            "differences": [],
            "sample_size": len(usable),
        }

    differences = []
    for metric, threshold in _MATERIAL.items():
        mine = getattr(site, metric)
        theirs = [getattr(r, metric) for r in usable]
        median = statistics.median(theirs)
        gap = mine - median
        if abs(gap) < threshold:
            continue
        higher, lower = _MEANING[metric]
        differences.append({
            "metric": metric,
            "site": round(mine, 3),
            "rival_median": round(median, 3),
            "rival_range": [round(min(theirs), 3), round(max(theirs), 3)],
            "gap": round(gap, 3),
            "reads_as": higher if gap > 0 else lower,
            "direction": "higher" if gap > 0 else "lower",
        })

    differences.sort(key=lambda d: abs(d["gap"] / _MATERIAL[d["metric"]]), reverse=True)
    return {
        "measured": True,
        "sample_size": len(usable),
        "differences": differences,
        "verdict": (
            "No material difference from the pages you compete with."
            if not differences else
            f"{len(differences)} measured differences from the pages you compete with."
        ),
    }
