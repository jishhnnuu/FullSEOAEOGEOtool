"""Advertising policy, checked before submission rather than after rejection.

A disapproved advert is an inconvenience. A pattern of them is an account
restriction, and a restricted Meta ad account is sometimes never recovered,
which ends a client's advertising permanently through no fault of theirs. That
asymmetry is why this runs before every submission and why it errs toward
refusing copy that would probably have been fine.

Each rule carries the platform's own reasoning rather than ours, because an
advertiser told "this breaks a rule" argues, and an advertiser told "Meta
prohibits copy that asserts or implies knowledge of a reader's personal
characteristics, and 'struggling with debt?' does that" rewrites it.

The rules below are the ones that actually cause rejections in volume. They
are not the whole of any platform's policy and the file says so on screen: a
clean result here means nothing known was tripped, not that approval is
guaranteed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class PolicyHit:
    rule: str
    severity: str        # "block" | "warn"
    matched: str
    why: str
    fix: str
    platforms: tuple[str, ...]


@dataclass
class PolicyRule:
    key: str
    pattern: re.Pattern[str]
    severity: str
    why: str
    fix: str
    platforms: tuple[str, ...] = ()


RULES: list[PolicyRule] = [
    PolicyRule(
        "personal_attributes",
        re.compile(
            r"\b(are you|do you (?:have|suffer|struggle)|struggling with|suffering from|your (?:diabetes|debt|"
            r"depression|anxiety|divorce|bankruptcy|addiction|weight problem|hair loss))\b",
            re.I,
        ),
        "block",
        "Meta prohibits copy asserting or implying knowledge of a reader's personal characteristics: health, "
        "finances, race, religion, sexual orientation or criminal record. Google has the same rule for "
        "personalised advertising. It is the single most common disapproval in health and finance.",
        "Write about the product rather than the reader. “Struggling with debt?” becomes "
        "“Debt consolidation from 4.9 per cent”, which says the same thing to the right person and "
        "accuses nobody.",
        ("meta_ads", "google_ads", "tiktok_ads"),
    ),
    PolicyRule(
        "guaranteed_outcome",
        re.compile(r"\b(guaranteed?|100% (?:success|effective|safe)|risk[- ]free|cure[sd]?|miracle|permanent(?:ly)? (?:cure|fix))\b", re.I),
        "block",
        "An unqualified guarantee of a result is prohibited across every major network, and in health, "
        "finance and legal it also attracts a regulator.",
        "Say what is actually promised. “Guaranteed results” becomes “30-day money back”, "
        "which is a guarantee you can keep.",
    ),
    PolicyRule(
        "unrealistic_earnings",
        re.compile(r"(£|\$|€)\s?\d[\d,]*(?:k|,000)?\s*(?:a|per|/)\s*(?:day|week|month)|make money fast|get rich", re.I),
        "block",
        "Income claims need substantiation and a disclaimer, and on Meta most are refused outright under "
        "the misleading claims policy.",
        "Drop the figure, or replace it with a verifiable customer outcome and name the customer.",
    ),
    PolicyRule(
        "before_after",
        re.compile(r"\bbefore (?:and|&|/) after\b|\bresults? in \d+ days?\b|\btransformation\b", re.I),
        "warn",
        "Before and after imagery is prohibited in health and fitness on Meta, and the phrase in copy "
        "usually accompanies the image that will be rejected.",
        "Show the process or the product rather than a body comparison.",
        ("meta_ads", "tiktok_ads"),
    ),
    PolicyRule(
        "excessive_caps",
        re.compile(r"\b[A-Z]{5,}\b"),
        "warn",
        "Gratuitous capitals are grounds for disapproval on Google and reduce delivery on Meta. An "
        "acronym is fine; a shouted word is not.",
        "Sentence case. If a word needs emphasis, the offer is not strong enough.",
    ),
    PolicyRule(
        "excessive_punctuation",
        re.compile(r"[!?]{2,}|!.*!"),
        "warn",
        "More than one exclamation mark in an ad is a Google editorial disapproval, stated in their "
        "published policy.",
        "One at most, and usually none.",
    ),
    PolicyRule(
        "false_urgency",
        re.compile(r"\b(?:only )?\d+ (?:spots?|places?|left)\b|\blast chance\b|\bends (?:today|tonight|in \d+ hours?)\b", re.I),
        "warn",
        "Urgency that is not true is a misrepresentation, and platforms increasingly check it against the "
        "landing page. A countdown that resets on refresh is an enforcement action waiting to happen.",
        "Only use it where the deadline is real and appears on the page. Otherwise cut it.",
    ),
    PolicyRule(
        "competitor_trademark",
        re.compile(r"\b(?:better than|cheaper than|vs\.?|versus|alternative to)\s+[A-Z][A-Za-z0-9]+", re.I),
        "warn",
        "A competitor's trademark in ad text can be removed on a complaint. Bidding on the term is "
        "usually allowed; putting it in the headline usually is not.",
        "Keep the term as a keyword and take the brand name out of the copy.",
    ),
    PolicyRule(
        "clickbait",
        re.compile(r"\b(?:you won'?t believe|doctors hate|one weird trick|shocking|this changes everything)\b", re.I),
        "block",
        "Sensational copy is explicitly listed under Meta's low quality policy and suppresses delivery "
        "even where it is not rejected.",
        "Say the actual thing. It performs better anyway.",
    ),
    PolicyRule(
        "health_claim",
        re.compile(r"\b(?:treats?|prevents?|reverses?|heals?)\s+\w+|\bFDA[- ]approved\b|\bclinically proven\b", re.I),
        "warn",
        "A medical claim needs evidence and, in the UK, compliance with the advertising codes. Platforms "
        "route these to manual review, which delays a launch by days.",
        "Soften to what can be evidenced, and keep the evidence to hand for the review.",
    ),
    PolicyRule(
        "personal_data_request",
        re.compile(r"\b(?:enter your|send us your)\s+(?:card|bank|passport|national insurance|social security)\b", re.I),
        "block",
        "Soliciting sensitive personal or financial details in an advert is prohibited everywhere and is "
        "a fast route to an account ban.",
        "Collect nothing sensitive in an ad or a lead form. Move it behind a verified account.",
    ),
]


# Categories that must be declared to the platform before the campaign runs.
# An undeclared campaign in one of these is removed and the account penalised.
#
# This is the one check in the file that deliberately errs toward firing. The
# house rule everywhere else is that a false positive costs more than a miss,
# because a wrong finding teaches people to ignore the right ones. Here the
# costs are the other way round: over-declaring loses postcode and age
# targeting on one campaign, which is recoverable in an afternoon, and
# under-declaring gets the campaign pulled and the ad account marked, which
# is not. So the patterns are wider than they would otherwise be, and the
# verdict says the category was detected rather than asserting it is certain.
SPECIAL_CATEGORIES: dict[str, re.Pattern[str]] = {
    "credit": re.compile(
        r"\b(loan|mortgage|credit (?:card|score|repair)|refinanc\w+|apr\b|buy now pay later|"
        r"debt(?:\W+\w+){0,2}\W+(?:consolidat\w+|relief|help|advice|free|solution|management)|"
        r"(?:consolidat\w+|clear|write off)(?:\W+\w+){0,2}\W+debt)\b",
        re.I,
    ),
    "employment": re.compile(r"\b(hiring|job opening|vacanc\w+|apply now for|recruit\w*|career opportunit\w+|we'?re hiring)\b", re.I),
    "housing": re.compile(r"\b(for sale by|rent(?:al)? propert\w+|estate agent|letting agent|new homes?|apartments? for rent)\b", re.I),
    "social_issue": re.compile(r"\b(election|vote for|referendum|immigration polic\w+|climate polic\w+|political)\b", re.I),
}


def check_text(text: str, platform: str | None = None) -> list[PolicyHit]:
    """Run every rule that applies to this platform over one piece of copy."""
    out: list[PolicyHit] = []
    if not text:
        return out
    for rule in RULES:
        if rule.platforms and platform and platform not in rule.platforms:
            continue
        match = rule.pattern.search(text)
        if not match:
            continue
        out.append(PolicyHit(
            rule=rule.key,
            severity=rule.severity,
            matched=match.group(0),
            why=rule.why,
            fix=rule.fix,
            platforms=rule.platforms or ("all",),
        ))
    return out


def special_category(text: str) -> str | None:
    """Which restricted category this offer falls into, if any.

    Declared on the campaign rather than discovered when it is taken down.
    A campaign in one of these loses age, postcode and detailed targeting by
    law in several jurisdictions, so it changes the plan, not just a checkbox.
    """
    for name, pattern in SPECIAL_CATEGORIES.items():
        if pattern.search(text or ""):
            return name
    return None


@dataclass
class PolicyVerdict:
    can_submit: bool
    blocks: list[PolicyHit]
    warnings: list[PolicyHit]
    category: str | None
    note: str

    def as_dict(self) -> dict:
        return {
            "can_submit": self.can_submit,
            "blocks": [h.__dict__ for h in self.blocks],
            "warnings": [h.__dict__ for h in self.warnings],
            "category": self.category,
            "note": self.note,
        }


def review(copy_fields: dict[str, str], platform: str | None = None) -> PolicyVerdict:
    """Everything in one advert, checked together."""
    hits: list[PolicyHit] = []
    joined = " ".join(v for v in copy_fields.values() if v)
    for value in copy_fields.values():
        hits.extend(check_text(value or "", platform))

    # One rule firing in three fields is one problem, not three.
    seen: dict[str, PolicyHit] = {}
    for hit in hits:
        seen.setdefault(hit.rule, hit)
    unique = list(seen.values())

    blocks = [h for h in unique if h.severity == "block"]
    warnings = [h for h in unique if h.severity == "warn"]
    category = special_category(joined)

    if blocks:
        note = (
            f"{len(blocks)} thing{'s' if len(blocks) != 1 else ''} here would be rejected, and repeated "
            "rejections restrict the ad account rather than just the ad. Nothing is submitted until they "
            "are changed."
        )
    elif warnings:
        note = (
            f"Nothing that blocks submission, and {len(warnings)} thing"
            f"{'s' if len(warnings) != 1 else ''} that often draws a manual review and delays the launch."
        )
    else:
        note = (
            "Nothing known was tripped. That is not a guarantee of approval: this checks the rules that "
            "cause rejections in volume, not the whole of any platform's policy."
        )
    if category:
        note += (
            f" This is a {category.replace('_', ' ')} offer, which is a restricted category. It is declared "
            "on the campaign, and the targeting available to it is reduced by law rather than by choice."
        )

    return PolicyVerdict(not blocks, blocks, warnings, category, note)
