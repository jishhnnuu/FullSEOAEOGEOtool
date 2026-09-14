"""Findings: the catalogue and the draft type.

Every check in the platform emits a :class:`FindingDraft` with a code from
:data:`CATALOG`. Putting severity, impact, effort and the recommendation in
one table rather than in the check functions means:

* the same issue is scored identically wherever it is detected,
* prioritisation is explainable ("high impact, low effort, we are confident"),
* a client can be shown the full catalogue of what is checked, which is what
  an agency's audit methodology document is for.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CheckDef:
    code: str
    category: str
    severity: str
    title: str
    why: str
    recommendation: str
    impact: float = 0.5
    effort: float = 0.4
    confidence: float = 0.8
    auto_fixable: bool = False
    fix_strategy: str | None = None


def _c(*args, **kwargs) -> CheckDef:
    return CheckDef(*args, **kwargs)


# ---------------------------------------------------------------------------
# The catalogue. Ordered by category so it reads like an audit methodology.
# ---------------------------------------------------------------------------
CATALOG: dict[str, CheckDef] = {d.code: d for d in [
    # -- indexability and crawl ---------------------------------------------
    _c("page_noindex", "technical", "critical",
       "Page is blocked from indexing",
       "A noindex directive removes the page from search results entirely.",
       "Remove the noindex meta tag or X-Robots-Tag header if this page should rank.",
       impact=1.0, effort=0.2, confidence=0.95),
    _c("page_5xx", "technical", "critical",
       "Server error",
       "A 5xx page cannot be indexed and burns crawl budget on every visit.",
       "Fix the server error. If the page is retired, return 410 or redirect it.",
       impact=1.0, effort=0.6),
    _c("page_404_linked", "technical", "high",
       "Broken internal link",
       "Internal links to 404s waste crawl budget and strand users mid-journey.",
       "Repoint the link to the live URL or remove it.",
       impact=0.6, effort=0.2, auto_fixable=True, fix_strategy="repoint_internal_link"),
    _c("redirect_chain", "technical", "medium",
       "Redirect chain",
       "Each extra hop loses a little authority and adds latency.",
       "Point the first URL straight at the final destination.",
       impact=0.4, effort=0.3, auto_fixable=True, fix_strategy="flatten_redirect"),
    _c("redirect_loop", "technical", "critical",
       "Redirect loop",
       "The URL never resolves, so neither users nor crawlers reach content.",
       "Break the loop and point the chain at a single final URL.",
       impact=1.0, effort=0.4),
    _c("robots_blocks_important", "technical", "critical",
       "robots.txt blocks a page that should rank",
       "Disallowed URLs cannot be crawled, so their content never enters the index.",
       "Narrow the Disallow rule so it no longer covers this path.",
       impact=1.0, effort=0.2),
    _c("orphan_page", "technical", "medium",
       "Orphan page",
       "No internal link points here, so it gets little crawl attention and no internal authority.",
       "Link to it from a relevant hub or category page.",
       impact=0.5, effort=0.3, auto_fixable=True, fix_strategy="add_internal_link"),
    _c("deep_page", "technical", "low",
       "Page is more than four clicks from the homepage",
       "Depth correlates with crawl frequency and with how much internal authority a page receives.",
       "Add a link from a shallower hub page.",
       impact=0.3, effort=0.3, auto_fixable=True, fix_strategy="add_internal_link"),
    _c("no_sitemap", "technical", "high",
       "No XML sitemap found",
       "A sitemap is how a search engine learns about pages your internal links miss.",
       "Publish an XML sitemap and reference it from robots.txt.",
       impact=0.6, effort=0.3, auto_fixable=True, fix_strategy="generate_sitemap"),
    _c("sitemap_contains_non_indexable", "technical", "medium",
       "Sitemap lists pages that cannot be indexed",
       "Submitting noindex or redirected URLs sends a contradictory signal.",
       "Remove non-indexable URLs from the sitemap.",
       impact=0.4, effort=0.2, auto_fixable=True, fix_strategy="clean_sitemap"),
    _c("no_https", "technical", "critical",
       "Page is not served over HTTPS",
       "HTTPS is a ranking signal and browsers warn users on insecure pages.",
       "Install a certificate and redirect all HTTP traffic to HTTPS.",
       impact=0.9, effort=0.5),
    _c("mixed_content", "technical", "high",
       "HTTPS page loads insecure resources",
       "Browsers block or warn on mixed content, breaking the page for some users.",
       "Serve every subresource over HTTPS.",
       impact=0.5, effort=0.3),

    # -- canonical and duplication -------------------------------------------
    _c("canonical_missing", "technical", "medium",
       "No canonical tag",
       "Without a canonical, parameter and variant URLs compete with each other.",
       "Add a self-referencing canonical to every indexable page.",
       impact=0.4, effort=0.2, auto_fixable=True, fix_strategy="add_self_canonical"),
    _c("canonical_mismatch", "technical", "high",
       "Canonical points to a different page",
       "The page is telling search engines to index something else, so it will not rank.",
       "Point the canonical at this URL unless it really is a duplicate.",
       impact=0.7, effort=0.2),
    _c("duplicate_content", "content", "high",
       "Duplicate page content",
       "Identical content splits signals between URLs and can suppress all of them.",
       "Consolidate to one URL and redirect or canonicalise the rest.",
       impact=0.6, effort=0.5),
    _c("duplicate_title", "content", "medium",
       "Duplicate title tag",
       "Identical titles make pages compete and give searchers no reason to pick one.",
       "Write a distinct title reflecting each page's specific topic.",
       impact=0.4, effort=0.2, auto_fixable=True, fix_strategy="rewrite_title"),
    _c("duplicate_meta_description", "content", "low",
       "Duplicate meta description",
       "Repeated descriptions lower click-through because the snippet is not about this page.",
       "Write a distinct description for each page.",
       impact=0.25, effort=0.2, auto_fixable=True, fix_strategy="rewrite_meta"),

    # -- on-page -------------------------------------------------------------
    _c("title_missing", "content", "high",
       "Missing title tag",
       "The title is the strongest on-page relevance signal and the search result headline.",
       "Write a title of 50 to 60 characters that leads with the page's primary topic.",
       impact=0.8, effort=0.1, auto_fixable=True, fix_strategy="rewrite_title"),
    _c("title_too_long", "content", "low",
       "Title is longer than the search snippet",
       "Truncated titles hide the part that would have earned the click.",
       "Trim to roughly 60 characters, keeping the distinguishing words first.",
       impact=0.25, effort=0.1, auto_fixable=True, fix_strategy="rewrite_title"),
    _c("title_too_short", "content", "low",
       "Title is very short",
       "A short title leaves relevance and click-through on the table.",
       "Expand it to describe what the page actually answers.",
       impact=0.25, effort=0.1, auto_fixable=True, fix_strategy="rewrite_title"),
    _c("meta_description_missing", "content", "medium",
       "Missing meta description",
       "Search engines will assemble a snippet themselves, usually less persuasively.",
       "Write 140 to 160 characters that state the benefit and invite the click.",
       impact=0.35, effort=0.1, auto_fixable=True, fix_strategy="rewrite_meta"),
    _c("h1_missing", "content", "medium",
       "No H1 heading",
       "The H1 confirms the page topic to readers, assistive technology and crawlers.",
       "Add one H1 that matches the page's primary topic.",
       impact=0.4, effort=0.1, auto_fixable=True, fix_strategy="add_h1"),
    _c("h1_multiple", "content", "low",
       "More than one H1",
       "Multiple H1s blur which topic the page is actually about.",
       "Keep one H1 and demote the others to H2.",
       impact=0.2, effort=0.2, auto_fixable=True, fix_strategy="fix_heading_hierarchy"),
    _c("heading_hierarchy_broken", "content", "low",
       "Heading levels skip",
       "Jumping from H2 to H4 breaks document outline for screen readers and parsers.",
       "Use heading levels in order without gaps.",
       impact=0.2, effort=0.2, auto_fixable=True, fix_strategy="fix_heading_hierarchy"),
    _c("thin_content", "content", "high",
       "Thin content",
       "Too little substance to satisfy the query or to be worth citing.",
       "Expand with specifics, or merge into a stronger page and redirect.",
       impact=0.6, effort=0.7),
    _c("no_internal_links_out", "content", "medium",
       "Page links to nothing internally",
       "A page that links nowhere is a dead end for both users and authority flow.",
       "Add contextual links to the most relevant related pages.",
       impact=0.35, effort=0.2, auto_fixable=True, fix_strategy="add_internal_link"),
    _c("content_stale", "content", "medium",
       "Content has not been updated in over 18 months",
       "Freshness matters for queries where the answer changes, and stale pages decay.",
       "Refresh the facts, dates and examples, then update the modified date.",
       impact=0.45, effort=0.5),

    # -- images --------------------------------------------------------------
    _c("image_alt_missing", "content", "medium",
       "Image without alt text",
       "Alt text is an accessibility requirement and the only way image search understands the file.",
       "Describe the image in plain language, or use an empty alt if it is decorative.",
       impact=0.3, effort=0.1, auto_fixable=True, fix_strategy="write_alt_text"),
    _c("image_oversized", "performance", "medium",
       "Oversized image",
       "Large images are the most common cause of a poor Largest Contentful Paint.",
       "Compress, resize to the displayed dimensions and serve WebP or AVIF.",
       impact=0.4, effort=0.3, auto_fixable=True, fix_strategy="optimise_image"),
    _c("image_legacy_format", "performance", "low",
       "Image uses a legacy format",
       "WebP and AVIF are typically 25 to 50 percent smaller at the same quality.",
       "Convert to WebP or AVIF with a fallback.",
       impact=0.25, effort=0.3, auto_fixable=True, fix_strategy="optimise_image"),
    _c("image_no_dimensions", "performance", "low",
       "Image has no width and height",
       "Missing dimensions cause layout shift as the image loads.",
       "Set explicit width and height attributes.",
       impact=0.25, effort=0.1, auto_fixable=True, fix_strategy="set_image_dimensions"),

    # -- performance ---------------------------------------------------------
    _c("lcp_poor", "performance", "high",
       "Largest Contentful Paint is poor",
       "LCP above 2.5s is a Core Web Vitals failure and costs conversions directly.",
       "Optimise the hero element: preload it, compress it, remove render-blocking work above it.",
       impact=0.6, effort=0.6),
    _c("inp_poor", "performance", "high",
       "Interaction to Next Paint is poor",
       "INP above 200ms makes the page feel broken when a user taps something.",
       "Break up long tasks and cut unused JavaScript on the critical path.",
       impact=0.55, effort=0.7),
    _c("cls_poor", "performance", "medium",
       "Cumulative Layout Shift is poor",
       "Content jumping under a user's finger is the most complained-about page behaviour there is.",
       "Reserve space for images, ads and late-loading embeds.",
       impact=0.45, effort=0.4),
    _c("excessive_javascript", "performance", "medium",
       "Very large JavaScript payload",
       "Parse and execution time on mid-range phones is where most performance is lost.",
       "Code-split, defer what is not needed for first paint, drop unused libraries.",
       impact=0.4, effort=0.7),

    # -- schema --------------------------------------------------------------
    _c("schema_missing", "schema", "medium",
       "No structured data",
       "Without schema the page cannot earn rich results and is harder for answer engines to parse.",
       "Add the JSON-LD type that matches this page: Article, Product, LocalBusiness, FAQPage.",
       impact=0.45, effort=0.3, auto_fixable=True, fix_strategy="generate_schema"),
    _c("schema_invalid", "schema", "high",
       "Structured data is invalid",
       "Invalid JSON-LD is ignored entirely, so the effort already spent earns nothing.",
       "Fix the syntax or the missing required properties.",
       impact=0.5, effort=0.3, auto_fixable=True, fix_strategy="fix_schema"),
    _c("schema_missing_required", "schema", "medium",
       "Structured data is missing required properties",
       "Rich results need the required fields; without them the markup is decorative.",
       "Add the properties this type requires.",
       impact=0.4, effort=0.2, auto_fixable=True, fix_strategy="fix_schema"),
    _c("schema_contradicts_page", "schema", "high",
       "Structured data does not match the visible page",
       "Markup that describes content a user cannot see is a manual action risk.",
       "Make the markup describe exactly what is on the page.",
       impact=0.7, effort=0.3),

    # -- AEO / GEO -----------------------------------------------------------
    _c("ai_crawler_blocked", "aeo", "high",
       "AI crawlers are blocked",
       "Blocking GPTBot, ClaudeBot, PerplexityBot and friends removes the site from AI answers.",
       "Decide deliberately: allow the crawlers you want citations from.",
       impact=0.7, effort=0.2, auto_fixable=True, fix_strategy="update_robots_ai"),
    _c("no_direct_answer", "aeo", "medium",
       "Page does not answer its question directly",
       "Answer engines quote the passage that states the answer plainly near the top.",
       "Open with a two to three sentence direct answer before the detail.",
       impact=0.5, effort=0.4, auto_fixable=True, fix_strategy="add_answer_block"),
    _c("no_citable_facts", "aeo", "medium",
       "No citable facts or data",
       "Models cite pages that contain specific numbers, dates and named sources.",
       "Add original data, specific figures and sourced statements.",
       impact=0.45, effort=0.6),
    _c("missing_llms_txt", "aeo", "low",
       "No llms.txt",
       "An llms.txt gives answer engines a curated map of what matters on the site.",
       "Publish /llms.txt listing the canonical pages and what each covers.",
       impact=0.2, effort=0.2, auto_fixable=True, fix_strategy="generate_llms_txt"),
    _c("no_author_attribution", "aeo", "medium",
       "No identifiable author",
       "Experience and expertise cannot be assessed without a real, credentialed author.",
       "Attribute the page to a named author with a linked bio and credentials.",
       impact=0.45, effort=0.4),
    _c("entity_unclear", "aeo", "medium",
       "The brand entity is not defined",
       "Answer engines resolve brands through consistent entity signals, not prose.",
       "Add Organization schema with sameAs links to the profiles that describe you.",
       impact=0.4, effort=0.3, auto_fixable=True, fix_strategy="generate_schema"),

    # -- local ---------------------------------------------------------------
    _c("nap_inconsistent", "local", "high",
       "Business name, address or phone is inconsistent",
       "Conflicting NAP data undermines the confidence that drives map pack ranking.",
       "Standardise one exact format and correct every listing to match.",
       impact=0.6, effort=0.4),
    _c("gbp_incomplete", "local", "high",
       "Google Business Profile is incomplete",
       "Profile completeness correlates directly with map pack visibility.",
       "Fill categories, services, hours, attributes and photos.",
       impact=0.6, effort=0.3, auto_fixable=True, fix_strategy="update_gbp"),
    _c("gbp_no_recent_posts", "local", "medium",
       "No recent Google Business Profile posts",
       "An inactive profile signals an inactive business to both users and the ranking system.",
       "Post weekly: offers, updates, events.",
       impact=0.35, effort=0.2, auto_fixable=True, fix_strategy="draft_gbp_post"),
    _c("reviews_unanswered", "local", "medium",
       "Reviews have no response",
       "Responding is a documented local ranking factor and changes how prospects read the profile.",
       "Reply to every review, positive and negative.",
       impact=0.4, effort=0.2, auto_fixable=True, fix_strategy="draft_review_reply"),
    _c("missing_location_page", "local", "medium",
       "No landing page for this location",
       "Each location needs a page to rank for its own city and to link the profile to.",
       "Build a location page with unique local content, embedded map and LocalBusiness schema.",
       impact=0.5, effort=0.6),
    _c("citation_missing", "local", "low",
       "Missing directory citation",
       "Citations on authoritative directories reinforce the entity and its NAP.",
       "Claim and complete the listing.",
       impact=0.25, effort=0.3),

    # -- off page ------------------------------------------------------------
    _c("toxic_backlinks", "offpage", "high",
       "Toxic backlinks detected",
       "Links from spam networks can drag a site down and occasionally trigger a manual action.",
       "Verify before acting, then disavow only what is clearly manipulative.",
       impact=0.5, effort=0.4),
    _c("lost_backlinks", "offpage", "medium",
       "Backlinks lost",
       "Losing earned links reverses the authority that earned the rankings.",
       "Check whether the page changed or was removed, then ask for reinstatement.",
       impact=0.4, effort=0.4),
    _c("unlinked_mention", "offpage", "medium",
       "Brand mentioned without a link",
       "The hardest part, the coverage, already happened. The link is one email away.",
       "Ask the author to link the mention.",
       impact=0.4, effort=0.2),
    _c("authority_gap", "offpage", "medium",
       "Competitors have substantially more referring domains",
       "For competitive queries, link authority is often the binding constraint.",
       "Build a linkable asset and run targeted outreach.",
       impact=0.55, effort=0.8),

    # -- international -------------------------------------------------------
    _c("hreflang_missing_return", "international", "high",
       "Hreflang has no return tag",
       "Hreflang is only honoured when every version points back at the others.",
       "Add reciprocal hreflang annotations on all versions.",
       impact=0.5, effort=0.3, auto_fixable=True, fix_strategy="fix_hreflang"),
    _c("hreflang_invalid_code", "international", "medium",
       "Invalid hreflang language or region code",
       "An invalid code is ignored, so the targeting silently does nothing.",
       "Use valid ISO 639-1 language and ISO 3166-1 Alpha 2 region codes.",
       impact=0.35, effort=0.2, auto_fixable=True, fix_strategy="fix_hreflang"),
    _c("no_x_default", "international", "low",
       "No x-default hreflang",
       "Users outside your targeted regions get an arbitrary version.",
       "Add an x-default pointing at the language selector or the global version.",
       impact=0.2, effort=0.2, auto_fixable=True, fix_strategy="fix_hreflang"),

    # -- ecommerce -----------------------------------------------------------
    _c("product_schema_incomplete", "ecommerce", "high",
       "Product markup is missing merchant listing fields",
       "Without price, availability and identifiers the product cannot appear in shopping surfaces.",
       "Add offers, price, priceCurrency, availability and a GTIN or MPN.",
       impact=0.6, effort=0.3, auto_fixable=True, fix_strategy="fix_schema"),
    _c("faceted_nav_crawl_waste", "ecommerce", "high",
       "Faceted navigation is generating crawlable duplicate URLs",
       "Filter combinations can multiply into millions of near-identical pages.",
       "Canonicalise or block the combinations that have no search demand.",
       impact=0.6, effort=0.5),
    _c("out_of_stock_indexed", "ecommerce", "medium",
       "Out of stock products are indexed as live",
       "Sending searchers to something they cannot buy wastes the click and the trust.",
       "Keep the page, update availability in the markup and offer alternatives.",
       impact=0.35, effort=0.3),

    # -- conversion and experience -------------------------------------------
    _c("no_clear_cta", "ux", "medium",
       "No clear call to action",
       "Traffic that cannot convert is a cost, not a result.",
       "Add one primary action above the fold that matches the page's intent.",
       impact=0.5, effort=0.3),
    _c("intent_mismatch", "ux", "high",
       "Page format does not match search intent",
       "A product page cannot win an informational query however well it is optimised.",
       "Match the format the ranking results use, or target a different query.",
       impact=0.7, effort=0.6),
    _c("mobile_unfriendly", "ux", "high",
       "Page is not mobile friendly",
       "Indexing is mobile-first, and most traffic is mobile.",
       "Fix the viewport, tap targets and horizontal overflow.",
       impact=0.7, effort=0.5),

    # -- compliance and risk --------------------------------------------------
    _c("ymyl_no_credentials", "compliance", "high",
       "Health, legal or financial content with no stated credentials",
       "For topics that affect health or money, unqualified advice is both a ranking and a liability problem.",
       "Attribute the content to a qualified reviewer and state the credential.",
       impact=0.7, effort=0.4),
    _c("unsubstantiated_claim", "compliance", "high",
       "Claim published without substantiation",
       "Unsupported superlatives and performance claims carry regulatory risk in most markets.",
       "Cite the source, soften the claim, or remove it.",
       impact=0.5, effort=0.2),
    _c("missing_disclosure", "compliance", "medium",
       "Affiliate or sponsored content without disclosure",
       "Undisclosed commercial relationships breach platform policy and advertising law.",
       "Add a clear disclosure above the fold.",
       impact=0.5, effort=0.1, auto_fixable=True, fix_strategy="add_disclosure"),
    _c("ai_content_unreviewed", "compliance", "medium",
       "Generated content published without human review",
       "Scaled content produced without oversight is exactly what spam policies target.",
       "Route through review and add a named human reviewer.",
       impact=0.6, effort=0.2),

    # -- analytics -----------------------------------------------------------
    _c("analytics_missing", "analytics", "high",
       "No analytics tag detected",
       "Without measurement, nothing that follows can be attributed or defended.",
       "Install GA4 or your analytics of choice and verify it fires.",
       impact=0.6, effort=0.2),
    _c("gsc_not_connected", "analytics", "high",
       "Search Console is not connected",
       "Search Console is the only first-party source of query and indexing truth.",
       "Connect the property so the platform can work from real data.",
       impact=0.8, effort=0.1),
    _c("conversion_tracking_missing", "analytics", "medium",
       "No conversion tracking",
       "Ranking without conversion data optimises for the wrong thing.",
       "Define and instrument the actions that represent revenue.",
       impact=0.5, effort=0.4),
]}


@dataclass
class FindingDraft:
    """What a check emits, before it is reconciled against stored findings."""

    code: str
    url: str | None = None
    detail: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)
    affected_urls: list[str] = field(default_factory=list)
    severity_override: str | None = None
    impact_override: float | None = None
    auto_fix_payload: dict[str, Any] | None = None
    found_by: str = "analysis"

    @property
    def definition(self) -> CheckDef:
        return CATALOG[self.code]

    @property
    def severity(self) -> str:
        return self.severity_override or self.definition.severity

    @property
    def category(self) -> str:
        return self.definition.category

    @property
    def title(self) -> str:
        return self.definition.title

    @property
    def impact(self) -> float:
        return self.impact_override if self.impact_override is not None else self.definition.impact

    def fingerprint(self) -> str:
        """Identity across crawls, so a finding is re-seen rather than re-created."""
        basis = f"{self.code}|{self.url or ''}"
        if not self.url and self.affected_urls:
            basis = f"{self.code}|site-wide"
        return hashlib.blake2b(basis.encode(), digest_size=16).hexdigest()

    def priority_score(self, confidence: float | None = None) -> float:
        """Impact x confidence / effort, scaled to 0-100.

        Deliberately simple and explainable. A client should be able to argue
        with the inputs, which means they have to be able to see them.
        """
        d = self.definition
        conf = confidence if confidence is not None else d.confidence
        effort = max(d.effort, 0.05)
        raw = (self.impact * conf) / effort
        breadth = 1.0 + min(len(self.affected_urls) / 50.0, 1.0)
        return round(min(raw * breadth * 12.0, 100.0), 1)


def known_codes() -> list[str]:
    return sorted(CATALOG)


def catalog_by_category() -> dict[str, list[CheckDef]]:
    out: dict[str, list[CheckDef]] = {}
    for definition in CATALOG.values():
        out.setdefault(definition.category, []).append(definition)
    for items in out.values():
        items.sort(key=lambda d: (d.severity, d.code))
    return out
