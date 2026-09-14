"""Connector registry and factory.

One place that knows which class serves which provider, what each needs to be
configured, and how to build one from a tenant's stored credentials. The
onboarding UI is generated from this, so adding a connector makes it appear in
the product without touching the front end.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from seoos.connectors.aivisibility import AIVisibilityConnector
from seoos.connectors.base import Connector, ConnectorResult
from seoos.connectors.cms import CMS_CONNECTORS
from seoos.connectors.data import (
    BingWebmasterConnector,
    DataForSEOConnector,
    IndexNowConnector,
    MozConnector,
    SerperConnector,
)
from seoos.connectors.google import (
    GoogleAnalyticsConnector,
    GoogleBusinessProfileConnector,
    GoogleSearchConsoleConnector,
    PageSpeedConnector,
)
from seoos.connectors.outreach import (
    LinkedInConnector,
    SendGridConnector,
    SMTPConnector,
)
from seoos.core.errors import NotFound
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.registry")

CONNECTORS: dict[str, type[Connector]] = {
    "google_search_console": GoogleSearchConsoleConnector,
    "google_analytics_4": GoogleAnalyticsConnector,
    "google_business_profile": GoogleBusinessProfileConnector,
    "pagespeed": PageSpeedConnector,
    "dataforseo": DataForSEOConnector,
    "moz": MozConnector,
    "serper": SerperConnector,
    "bing_webmaster": BingWebmasterConnector,
    "indexnow": IndexNowConnector,
    "smtp": SMTPConnector,
    "sendgrid": SendGridConnector,
    "linkedin": LinkedInConnector,
    **CMS_CONNECTORS,
}


@dataclass
class FieldSpec:
    """One input the onboarding form asks for."""

    key: str
    label: str
    kind: str = "text"  # text | password | url | select | number
    required: bool = True
    help: str = ""
    placeholder: str = ""
    options: list[str] | None = None
    secret: bool = False


@dataclass
class ProviderSpec:
    provider: str
    display_name: str
    category: str
    auth_kind: str
    summary: str
    unlocks: str
    credential_fields: list[FieldSpec]
    config_fields: list[FieldSpec]
    docs_url: str = ""
    optional: bool = True
    setup_notes: str = ""


def _f(key, label, **kw) -> FieldSpec:
    return FieldSpec(key=key, label=label, **kw)


# The catalogue the onboarding wizard renders. Ordering is deliberate: the
# things that change results most sit at the top, and everything below
# "search" is genuinely optional.
PROVIDER_SPECS: list[ProviderSpec] = [
    ProviderSpec(
        provider="google_search_console",
        display_name="Google Search Console",
        category="search",
        auth_kind="oauth2",
        summary="The queries, pages and indexing state Google actually sees",
        unlocks=(
            "Real keyword targets instead of guesses, striking-distance "
            "opportunities, click-through gaps, and proof that what we shipped worked"
        ),
        optional=False,
        credential_fields=[],
        config_fields=[_f("site_url", "Property", kind="select", help="Chosen after you connect")],
        docs_url="https://search.google.com/search-console",
    ),
    ProviderSpec(
        provider="google_analytics_4",
        display_name="Google Analytics 4",
        category="analytics",
        auth_kind="oauth2",
        summary="Sessions, conversions and revenue by landing page",
        unlocks="Reporting in revenue rather than rankings, and content decisions based on what converts",
        credential_fields=[],
        config_fields=[_f("property_id", "Property", kind="select")],
    ),
    ProviderSpec(
        provider="google_business_profile",
        display_name="Google Business Profile",
        category="local",
        auth_kind="oauth2",
        summary="Listings, posts, reviews and Q&A for physical locations",
        unlocks="Automated weekly posts, drafted review replies, profile completeness fixes, map pack tracking",
        credential_fields=[],
        config_fields=[],
        setup_notes=(
            "Google requires a one-off manual approval before any project gets "
            "Business Profile API quota, and new projects start at zero. Until it "
            "is granted, local work still runs and the platform prepares posts and "
            "replies for you to paste in."
        ),
    ),
    ProviderSpec(
        provider="wordpress",
        display_name="WordPress",
        category="cms",
        auth_kind="app_password",
        summary="Publish and edit through the WordPress REST API",
        unlocks="Approved content goes live by itself, and on-page fixes apply without a developer",
        credential_fields=[
            _f("username", "WordPress username"),
            _f("application_password", "Application password", kind="password", secret=True,
               help="Users -> Profile -> Application Passwords. Revoke it any time."),
        ],
        config_fields=[_f("site_url", "Site URL", kind="url", placeholder="https://example.com")],
        docs_url="https://wordpress.org/documentation/article/application-passwords/",
    ),
    ProviderSpec(
        provider="shopify",
        display_name="Shopify",
        category="cms",
        auth_kind="token",
        summary="Products, collections and blog content",
        unlocks="Product and collection copy, SEO metafields, merchant listing fixes",
        credential_fields=[_f("access_token", "Admin API access token", kind="password", secret=True)],
        config_fields=[_f("shop", "Shop domain", placeholder="your-store.myshopify.com")],
    ),
    ProviderSpec(
        provider="webflow",
        display_name="Webflow",
        category="cms",
        auth_kind="token",
        summary="CMS collection items and site publishing",
        unlocks="Blog and resource content published into your collections",
        credential_fields=[_f("access_token", "API token", kind="password", secret=True)],
        config_fields=[
            _f("site_id", "Site", kind="select"),
            _f("collection_id", "Blog collection", kind="select"),
        ],
    ),
    ProviderSpec(
        provider="ghost",
        display_name="Ghost",
        category="cms",
        auth_kind="api_key",
        summary="Posts and pages through the Admin API",
        unlocks="Scheduled publishing with full control of meta and canonical tags",
        credential_fields=[_f("admin_api_key", "Admin API key", kind="password", secret=True)],
        config_fields=[_f("site_url", "Site URL", kind="url")],
    ),
    ProviderSpec(
        provider="github",
        display_name="GitHub (static site)",
        category="cms",
        auth_kind="token",
        summary="Next.js, Astro, Hugo, Jekyll and any repo-backed site",
        unlocks=(
            "Content arrives as a pull request, so your own review and CI gates "
            "apply before anything goes live"
        ),
        credential_fields=[_f("token", "Personal access token", kind="password", secret=True,
                              help="Needs contents:write and pull_requests:write on the one repo")],
        config_fields=[
            _f("repo", "Repository", placeholder="owner/name"),
            _f("base_branch", "Base branch", required=False, placeholder="main"),
            _f("content_dir", "Content directory", required=False, placeholder="content/blog"),
            _f("extension", "File extension", required=False, placeholder="md"),
        ],
    ),
    ProviderSpec(
        provider="dataforseo",
        display_name="DataForSEO",
        category="data",
        auth_kind="basic",
        summary="SERPs, keyword volumes, backlinks and map pack data",
        unlocks="Competitor analysis, keyword research at scale, geo-grid local rank tracking",
        credential_fields=[
            _f("login", "API login"),
            _f("password", "API password", kind="password", secret=True),
        ],
        config_fields=[],
        setup_notes="Pay as you go with no seat cost. A $50 balance covers months of a small site.",
    ),
    ProviderSpec(
        provider="moz",
        display_name="Moz",
        category="data",
        auth_kind="basic",
        summary="Domain and page authority, spam score",
        unlocks="Link prospect qualification and authority benchmarking",
        credential_fields=[
            _f("access_id", "Access ID"),
            _f("secret_key", "Secret key", kind="password", secret=True),
        ],
        config_fields=[],
    ),
    ProviderSpec(
        provider="bing_webmaster",
        display_name="Bing Webmaster Tools",
        category="search",
        auth_kind="api_key",
        summary="Bing and Copilot index coverage, plus URL submission",
        unlocks="Visibility on the index that feeds Copilot, and faster recrawls",
        credential_fields=[_f("api_key", "API key", kind="password", secret=True)],
        config_fields=[_f("site_url", "Verified site", kind="url")],
    ),
    ProviderSpec(
        provider="indexnow",
        display_name="IndexNow",
        category="search",
        auth_kind="api_key",
        summary="Push changed URLs to Bing, Yandex, Seznam and Naver",
        unlocks="Minutes-not-days recrawl after every publish. Free, no account needed.",
        credential_fields=[_f("key", "IndexNow key", help="Any 8 to 128 character string you choose")],
        config_fields=[_f("host", "Host", placeholder="example.com")],
        setup_notes="You will need to upload one text file to your site root; the platform generates it.",
    ),
    ProviderSpec(
        provider="smtp",
        display_name="Your mail server (SMTP)",
        category="outreach",
        auth_kind="basic",
        summary="Send outreach from your own domain",
        unlocks="Link building and digital PR that actually gets opened",
        credential_fields=[
            _f("host", "SMTP host"),
            _f("port", "Port", kind="number", required=False, placeholder="587"),
            _f("username", "Username"),
            _f("password", "Password", kind="password", secret=True),
        ],
        config_fields=[
            _f("from_email", "From address"),
            _f("from_name", "From name", required=False),
        ],
        setup_notes="Outreach always leaves from your domain, never from ours, and never in bulk.",
    ),
    ProviderSpec(
        provider="linkedin",
        display_name="LinkedIn",
        category="social",
        auth_kind="oauth2",
        summary="Company page posting",
        unlocks="Distribution for published content, which is how new pages earn their first links",
        credential_fields=[],
        config_fields=[_f("organization_urn", "Company page", kind="select")],
        setup_notes="Company pages only. The platform never automates personal profiles or direct messages.",
    ),
    ProviderSpec(
        provider="pagespeed",
        display_name="PageSpeed Insights",
        category="performance",
        auth_kind="api_key",
        summary="Lab and field Core Web Vitals for any URL",
        unlocks="Performance diagnosis for your site and for competitors",
        credential_fields=[_f("api_key", "Google API key", kind="password", secret=True, required=False,
                              help="Optional. Without one, requests are rate limited but still work.")],
        config_fields=[],
    ),
]

SPECS_BY_PROVIDER = {spec.provider: spec for spec in PROVIDER_SPECS}


def get_connector_class(provider: str) -> type[Connector]:
    klass = CONNECTORS.get(provider)
    if klass is None:
        raise NotFound(f"No connector for provider {provider!r}")
    return klass


def build_connector(
    provider: str, credentials: dict[str, Any], *, config: dict | None = None, router=None
) -> Connector:
    if provider == "ai_visibility":
        if router is None:
            raise NotFound("AI visibility needs a model router")
        return AIVisibilityConnector(router, credentials=credentials, config=config)
    klass = get_connector_class(provider)
    return klass(credentials, config=config or {})


def catalogue(category: str | None = None) -> list[dict]:
    """What the onboarding UI renders."""
    specs = PROVIDER_SPECS if category is None else [
        s for s in PROVIDER_SPECS if s.category == category
    ]
    return [
        {
            "provider": s.provider,
            "display_name": s.display_name,
            "category": s.category,
            "auth_kind": s.auth_kind,
            "summary": s.summary,
            "unlocks": s.unlocks,
            "optional": s.optional,
            "docs_url": s.docs_url,
            "setup_notes": s.setup_notes,
            "credential_fields": [vars(f) for f in s.credential_fields],
            "config_fields": [vars(f) for f in s.config_fields],
        }
        for s in specs
    ]


def capabilities_for(providers: set[str]) -> set[str]:
    """What the platform can actually do for a client with these connections.

    The planner uses this to avoid promising work it has no route to perform,
    which is the difference between a roadmap and a wish list.
    """
    unlocked: set[str] = {
        # Always available: these need nothing but the public site.
        "crawl", "technical_audit", "content_audit", "schema_audit",
        "aeo_audit", "internal_linking", "competitor_page_analysis",
    }
    if "google_search_console" in providers:
        unlocked |= {"real_keywords", "striking_distance", "ctr_optimisation",
                     "indexing_diagnosis", "performance_attribution"}
    if "google_analytics_4" in providers:
        unlocked |= {"conversion_attribution", "revenue_reporting"}
    if "google_business_profile" in providers:
        unlocked |= {"gbp_management", "review_replies", "local_posts"}
    if providers & set(CMS_CONNECTORS):
        unlocked |= {"auto_publish", "auto_fix_onpage", "schema_deploy"}
    if "dataforseo" in providers or "serper" in providers:
        unlocked |= {"serp_analysis", "keyword_research", "competitor_tracking"}
    if "dataforseo" in providers:
        unlocked |= {"backlink_analysis", "geo_grid", "keyword_volumes"}
    if "moz" in providers:
        unlocked |= {"authority_scoring", "prospect_qualification"}
    if providers & {"smtp", "sendgrid"}:
        unlocked |= {"outreach_sending"}
    if providers & {"indexnow", "bing_webmaster"}:
        unlocked |= {"push_indexing"}
    if "linkedin" in providers:
        unlocked |= {"social_distribution"}
    return unlocked


def unlocks_capability(capability: str, providers: set[str]) -> list[str]:
    """Which connections would unlock this capability, given what is already on.

    Turns "we cannot do keyword research for you" into "connect DataForSEO or
    Serper and we can", which is the only version of that sentence worth
    showing a client.
    """
    current = capabilities_for(providers)
    if capability in current:
        return []
    return sorted(
        candidate
        for candidate in CONNECTORS
        if capability in capabilities_for(providers | {candidate})
    )


async def verify_all(
    connections: list[tuple[str, dict, dict]], *, router=None
) -> dict[str, ConnectorResult]:
    """Verify a batch of connections concurrently. Used at onboarding and by
    the daily health check."""
    import asyncio

    async def one(provider: str, credentials: dict, config: dict):
        try:
            connector = build_connector(provider, credentials, config=config, router=router)
        except NotFound as exc:
            return provider, ConnectorResult.failure(exc.message)
        try:
            async with connector:
                return provider, await connector.verify()
        except Exception as exc:  # noqa: BLE001
            return provider, ConnectorResult.failure(str(exc))

    results = await asyncio.gather(*(one(p, c, cfg) for p, c, cfg in connections))
    return dict(results)
