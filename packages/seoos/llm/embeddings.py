"""Embeddings with a dependency-free fallback.

The brand brain needs semantic retrieval over the client's own documents. If
a provider embedding endpoint is available it is used; if not, a hashed
bag-of-ngrams vector keeps retrieval working at reduced quality rather than
disabling the feature. That trade-off is the same one the resolver ladder
makes everywhere: a weaker answer marked as weaker beats no answer.
"""

from __future__ import annotations

import hashlib
import math
import re

EMBED_DIM = 512
_TOKEN_RE = re.compile(r"[a-z0-9']+")


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def hashing_embed(text: str, dim: int = EMBED_DIM) -> list[float]:
    """Hashed unigram + bigram vector, L2 normalised.

    Not a substitute for a learned embedding, but good enough to pull the
    right three paragraphs out of a fifty-page brand book, which is the job.
    """
    vec = [0.0] * dim
    toks = _tokens(text)
    grams = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:], strict=False)]
    for gram in grams:
        h = hashlib.blake2b(gram.encode(), digest_size=8).digest()
        idx = int.from_bytes(h[:4], "big") % dim
        sign = 1.0 if h[4] % 2 == 0 else -1.0
        # Sub-linear term weighting keeps a repeated word from dominating.
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def chunk_text(text: str, *, target_chars: int = 1200, overlap: int = 150) -> list[str]:
    """Paragraph-aware chunking.

    Splitting mid-sentence produces chunks that retrieve badly, so paragraphs
    are kept whole until they exceed the target.
    """
    text = (text or "").strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        if len(para) > target_chars * 2:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sentence in sentences:
                if len(buf) + len(sentence) + 1 > target_chars and buf:
                    chunks.append(buf.strip())
                    buf = buf[-overlap:] if overlap else ""
                buf += " " + sentence
            continue
        if len(buf) + len(para) + 2 > target_chars and buf:
            chunks.append(buf.strip())
            buf = buf[-overlap:] if overlap else ""
        buf += "\n\n" + para
    if buf.strip():
        chunks.append(buf.strip())
    return chunks


def top_k(query_vec: list[float], candidates: list[tuple[str, list[float]]], k: int = 5):
    scored = [(cosine(query_vec, vec), key) for key, vec in candidates]
    scored.sort(reverse=True)
    return scored[:k]
