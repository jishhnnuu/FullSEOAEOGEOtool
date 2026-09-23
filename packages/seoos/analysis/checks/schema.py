"""Structured data validation and generation.

Validation is rule-based against the property requirements that actually
gate rich results, not against the full schema.org vocabulary. A validator
that reports every optional property as a warning trains people to ignore it.
"""

from __future__ import annotations

from typing import Any

from seoos.analysis.crawler import CrawledPage
from seoos.analysis.findings import FindingDraft

# type -> (required, recommended). Required means "no rich result without it".
REQUIREMENTS: dict[str, tuple[set[str], set[str]]] = {
    "Article": ({"headline"}, {"author", "datePublished", "image", "publisher", "dateModified"}),
    "BlogPosting": ({"headline"}, {"author", "datePublished", "image", "dateModified"}),
    "NewsArticle": ({"headline", "datePublished"}, {"author", "image", "publisher"}),
    "Product": ({"name"}, {"image", "description", "brand", "offers", "aggregateRating", "review"}),
    "Offer": ({"price", "priceCurrency"}, {"availability", "url", "priceValidUntil"}),
    "LocalBusiness": ({"name", "address"}, {"telephone", "openingHoursSpecification", "geo", "url", "image", "priceRange"}),
    "Organization": ({"name"}, {"url", "logo", "sameAs", "description", "contactPoint"}),
    "FAQPage": ({"mainEntity"}, set()),
    "Question": ({"name", "acceptedAnswer"}, set()),
    "HowTo": ({"name", "step"}, {"totalTime", "supply", "tool", "image"}),
    "Recipe": ({"name", "recipeIngredient", "recipeInstructions"}, {"image", "author", "nutrition", "cookTime"}),
    "Event": ({"name", "startDate", "location"}, {"endDate", "offers", "performer", "eventStatus"}),
    "JobPosting": ({"title", "description", "datePosted", "hiringOrganization"}, {"jobLocation", "baseSalary", "validThrough"}),
    "BreadcrumbList": ({"itemListElement"}, set()),
    "VideoObject": ({"name", "description", "thumbnailUrl", "uploadDate"}, {"duration", "contentUrl"}),
    "SoftwareApplication": ({"name"}, {"applicationCategory", "operatingSystem", "offers", "aggregateRating"}),
    "Person": ({"name"}, {"jobTitle", "sameAs", "worksFor", "knowsAbout"}),
    "Review": ({"reviewRating", "author"}, {"itemReviewed", "datePublished"}),
    "AggregateRating": ({"ratingValue", "ratingCount"}, {"bestRating", "worstRating"}),
    "Service": ({"name"}, {"provider", "areaServed", "serviceType", "offers"}),
}

# Product markup that must be complete to appear in merchant listings.
MERCHANT_LISTING_REQUIRED = {"name", "image", "offers"}
MERCHANT_OFFER_REQUIRED = {"price", "priceCurrency", "availability"}

# Types whose headline is a claim about *this page's* content, so a mismatch
# between markup and page is a real contradiction. Entity-level types
# (Organization, WebSite, LocalBusiness, BreadcrumbList, SoftwareApplication)
# are deliberately absent: their name and description describe the business or
# the site, are legitimately absent from body copy, and usually appear site
# wide, so comparing them fires on every page at once.
CONTENT_BEARING_TYPES = {
    "Article", "BlogPosting", "NewsArticle", "Product", "Recipe",
    "HowTo", "Event", "JobPosting", "VideoObject", "QAPage",
}


def validate_jsonld(
    blocks: list[dict],
    *,
    page_text: str = "",
    title: str | None = None,
    headings: list[str] | None = None,
) -> dict[str, Any]:
    """Validate a page's JSON-LD. Returns issues, not a pass/fail boolean."""
    issues: list[dict] = []
    types_found: list[str] = []

    for index, block in enumerate(blocks):
        if "@error" in block:
            issues.append(
                {"severity": "error", "type": None, "index": index,
                 "message": "JSON-LD could not be parsed", "code": "schema_invalid"}
            )
            continue
        raw_type = block.get("@type")
        block_types = [raw_type] if isinstance(raw_type, str) else list(raw_type or [])
        if not block_types:
            issues.append(
                {"severity": "error", "type": None, "index": index,
                 "message": "Block has no @type", "code": "schema_invalid"}
            )
            continue
        types_found.extend(block_types)

        if "@context" not in block and index == 0:
            issues.append(
                {"severity": "warning", "type": block_types[0], "index": index,
                 "message": "No @context declared", "code": "schema_invalid"}
            )

        for block_type in block_types:
            required, recommended = REQUIREMENTS.get(block_type, (set(), set()))
            missing_required = sorted(r for r in required if not _present(block, r))
            if missing_required:
                issues.append(
                    {"severity": "error", "type": block_type, "index": index,
                     "message": f"Missing required: {', '.join(missing_required)}",
                     "properties": missing_required, "code": "schema_missing_required"}
                )
            missing_recommended = sorted(r for r in recommended if not _present(block, r))
            if missing_recommended:
                issues.append(
                    {"severity": "info", "type": block_type, "index": index,
                     "message": f"Missing recommended: {', '.join(missing_recommended)}",
                     "properties": missing_recommended, "code": "schema_missing_required"}
                )

        # Markup describing content that is not on the page is a policy risk,
        # not a nicety, so it is checked rather than assumed. The rule is
        # deliberately narrow, and the narrowing was bought with a bug: an
        # earlier version compared `description` on any type, which fires on
        # every page of every site carrying a site-wide Organization block,
        # because an Organization description is an entity fact and was never
        # meant to be body copy. Forty high-severity false positives on forty
        # pages is worse than missing the real case, so only the headline of a
        # type that *is* the page is compared, and `description` never is.
        if page_text:
            # Every place a headline may legitimately appear. The title and the
            # headings matter as much as the body: a page states its subject in
            # its title first, and that is not a contradiction.
            haystack = " \n ".join(
                part for part in [page_text, title or "", *(headings or [])] if part
            ).lower()
            for block_type in block_types:
                if block_type not in CONTENT_BEARING_TYPES:
                    continue
                for prop in ("headline", "name"):
                    value = block.get(prop)
                    if not isinstance(value, str) or len(value) <= 25:
                        continue
                    if value[:60].lower() not in haystack:
                        issues.append(
                            {"severity": "warning", "type": block_type, "index": index,
                             "message": f"{prop} in {block_type} markup does not appear in the visible page",
                             "code": "schema_contradicts_page"}
                        )
                    break
                break

        # FAQPage markup on a page with no questions is the cheapest version of
        # the same problem, and the one Google has issued manual actions over.
        if "FAQPage" in block_types and page_text and "?" not in page_text:
            issues.append(
                {"severity": "warning", "type": "FAQPage", "index": index,
                 "message": "FAQPage markup on a page with no visible questions",
                 "code": "schema_contradicts_page"}
            )

    return {
        "types": sorted(set(types_found)),
        "issues": issues,
        "errors": [i for i in issues if i["severity"] == "error"],
        "valid": not any(i["severity"] == "error" for i in issues),
        "block_count": len(blocks),
    }


def check_schema(page: CrawledPage) -> list[FindingDraft]:
    signals = page.signals
    if signals is None or not page.ok:
        return []
    out: list[FindingDraft] = []
    url = page.url

    if not signals.jsonld and not signals.microdata_types:
        out.append(
            FindingDraft(
                "schema_missing", url,
                "No JSON-LD or microdata on the page",
                auto_fix_payload={"suggested_type": suggest_type(page)},
            )
        )
        return out

    # The whole page, not the chrome-stripped body. An Article headline lives
    # in the page header, which `main_text` deliberately removes, so comparing
    # a headline against `main_text` marks every correctly built blog post as
    # contradicting itself. Auditing one real site produced 45 of those at high
    # severity before this was caught.
    result = validate_jsonld(
        signals.jsonld,
        page_text=signals.text,
        title=signals.title,
        headings=[h for _, h in signals.headings],
    )
    for issue in result["issues"]:
        if issue["severity"] == "info":
            continue
        out.append(
            FindingDraft(
                issue["code"], url, issue["message"],
                evidence={"type": issue.get("type"), "properties": issue.get("properties")},
                severity_override="high" if issue["severity"] == "error" else None,
            )
        )

    if "Product" in result["types"]:
        product = next(
            (b for b in signals.jsonld if "Product" in str(b.get("@type", ""))), {}
        )
        missing = sorted(p for p in MERCHANT_LISTING_REQUIRED if not _present(product, p))
        offers = product.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        missing += [f"offers.{p}" for p in sorted(MERCHANT_OFFER_REQUIRED) if not _present(offers, p)]
        if missing:
            out.append(
                FindingDraft(
                    "product_schema_incomplete", url,
                    f"Missing merchant listing fields: {', '.join(missing)}",
                    evidence={"missing": missing},
                    auto_fix_payload={"missing": missing},
                )
            )
    return out


def suggest_type(page: CrawledPage) -> str:
    """Best guess at the schema type this page should carry."""
    url = (page.url or "").lower()
    signals = page.signals
    text = ((signals.main_text if signals else "") or "").lower()

    if any(seg in url for seg in ("/product", "/shop/", "/p/", "/item")):
        return "Product"
    if any(seg in url for seg in ("/blog", "/article", "/news", "/guide", "/post")):
        return "Article"
    if any(seg in url for seg in ("/location", "/store", "/branch", "/contact")):
        return "LocalBusiness"
    if any(seg in url for seg in ("/faq", "/help", "/support")):
        return "FAQPage"
    if any(seg in url for seg in ("/how-to", "/tutorial", "/steps")):
        return "HowTo"
    if any(seg in url for seg in ("/jobs", "/careers")):
        return "JobPosting"
    if any(seg in url for seg in ("/event", "/webinar")):
        return "Event"
    if signals and signals.has_faq_schema:
        return "FAQPage"
    if signals and signals.question_headings and len(signals.question_headings) >= 3:
        return "FAQPage"
    if "add to cart" in text or "buy now" in text:
        return "Product"
    if url.rstrip("/").count("/") <= 2:
        return "Organization"
    return "Article"


def generate_jsonld(schema_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """Build a valid JSON-LD block, dropping empty values.

    Empty properties are worse than absent ones: they look like markup and
    validate as errors.
    """
    block: dict[str, Any] = {"@context": "https://schema.org", "@type": schema_type}
    for key, value in data.items():
        if value in (None, "", [], {}):
            continue
        block[key] = value
    return block


def _present(block: dict, prop: str) -> bool:
    value = block.get(prop)
    if value in (None, "", [], {}):
        return False
    return True
