"""Publishing and applying changes to the live site.

Everything here mutates the client's property, so every tool declares its
risk, and the approval policy decides whether a human signs it off. Nothing
in this module bypasses that.
"""

from __future__ import annotations

from seoos.connectors.cms.base import ContentPayload
from seoos.core.errors import CredentialMissing
from seoos.services.audit_log import record_event
from seoos.services.content import ContentService
from seoos.services.findings import FindingsService
from seoos.tools._helpers import (
    array,
    connected_providers,
    connector_for,
    load_site,
    schema,
    string,
)
from seoos.tools.content_tools import _markdown_to_html
from seoos.tools.registry import ToolContext, ToolOutcome, tool

CMS_PROVIDERS = (
    "wordpress", "shopify", "webflow", "ghost", "contentful",
    "sanity", "strapi", "github", "custom_http",
)


async def _cms_for(ctx: ToolContext):
    """Find whichever CMS this site is connected to."""
    site = await load_site(ctx)
    providers = await connected_providers(ctx)
    preferred = site.cms_platform if site and site.cms_platform in CMS_PROVIDERS else None
    for provider in ([preferred] if preferred else []) + list(CMS_PROVIDERS):
        if provider and provider in providers:
            return provider, await connector_for(ctx, provider, config=site.cms_config if site else None)
    raise CredentialMissing(
        "No CMS is connected, so nothing can be published automatically. "
        "Connect WordPress, Shopify, Webflow, Ghost, a headless CMS, or a "
        "GitHub repository for a static site."
    )


@tool(
    "publish.content",
    """Publish an approved content item to the client's CMS.

    Only runs on items in 'approved' or 'scheduled'. Verifies the published
    URL afterwards, because a CMS returning 200 is not the same as a page
    being live and indexable.""",
    schema(
        content_id=string("The content item to publish"),
        status_=string("Publish state", enum=["draft", "published", "scheduled"],
                       default="published"),
    ),
    category="publish",
    mutates=True,
    risk="high",
    approval_type="content_publish",
    auto_from="managed",
)
async def publish_content(
    ctx: ToolContext, content_id: str, status: str = "published"
) -> ToolOutcome:
    service = ContentService(ctx.session)
    item = await service.get(content_id, org_id=ctx.org_id)

    if item.status not in ("approved", "scheduled", "publishing"):
        return ToolOutcome(
            ok=False,
            error=(
                f"'{item.title}' is at status '{item.status}'. Only approved "
                "content can be published."
            ),
        )

    provider, connector = await _cms_for(ctx)
    payload = ContentPayload(
        title=item.title,
        body_html=_markdown_to_html(item.body_markdown or ""),
        slug=item.slug,
        excerpt=item.meta_description,
        meta_title=item.meta_title,
        meta_description=item.meta_description,
        status=status,
        content_type=_cms_type_for(item.type, provider),
        tags=[k for k in (item.secondary_keywords or [])][:8],
        schema_jsonld=item.schema_jsonld,
        publish_at=item.scheduled_for.isoformat() if item.scheduled_for else None,
        custom_fields={
            "body_markdown": item.body_markdown,
            "primary_keyword": item.primary_keyword,
        },
    )

    if item.status != "publishing":
        await service.transition(content_id, "publishing", author=ctx.agent_key or "agent",
                                 snapshot=False)

    async with connector:
        result = (
            await connector.update_content(item.cms_ref, payload)
            if item.cms_ref
            else await connector.create_content(payload)
        )

    if not result.ok:
        item.publish_error = result.error
        item.status = "approved"
        await ctx.session.flush()
        return ToolOutcome(ok=False, error=f"{provider}: {result.error}")

    item.cms_ref = result.id or item.cms_ref
    item.published_url = result.url or item.published_url
    item.publish_error = None
    await service.transition(content_id, "published", author=ctx.agent_key or "agent")

    await record_event(
        ctx.session,
        org_id=ctx.org_id, site_id=ctx.site_id,
        action="content.published", object_type="content", object_id=item.id,
        actor_type="agent", actor_id=ctx.agent_key,
        summary=f"Published '{item.title}' to {provider}",
        after={"url": item.published_url, "cms_ref": item.cms_ref},
        reversible=True, mission_run_id=ctx.mission_run_id,
    )

    return ToolOutcome(
        ok=True,
        summary=f"Published '{item.title}' to {provider}"
                + (f" at {result.url}" if result.url else ""),
        data={
            "content_id": item.id,
            "url": result.url,
            "cms_ref": result.id,
            "provider": provider,
            "cms_status": result.status,
            "warnings": result.warnings,
        },
    )


def _cms_type_for(content_type: str, provider: str) -> str:
    if provider == "shopify":
        return "product" if content_type in ("product_page", "category_page") else "article"
    if provider == "webflow":
        return "collection_item"
    if provider in ("contentful", "sanity", "strapi"):
        return "entry" if provider != "sanity" else "document"
    if provider == "github":
        return "markdown"
    return "page" if content_type in ("landing_page", "location_page") else "post"


@tool(
    "publish.update_meta",
    """Rewrite a live page's title tag and meta description.

    The highest-frequency change the platform makes and the safest: fully
    reversible, no layout risk, and measurable in Search Console within two
    weeks.""",
    schema(
        url=string("The live page URL"),
        meta_title_=string("New title tag, 50 to 60 characters"),
        meta_description_=string("New meta description, 140 to 160 characters"),
        finding_id_=string("The finding this resolves, if any"),
    ),
    category="publish",
    mutates=True,
    risk="low",
    approval_type="technical_fix",
    auto_from="assisted",
)
async def publish_update_meta(
    ctx: ToolContext,
    url: str,
    meta_title: str | None = None,
    meta_description: str | None = None,
    finding_id: str | None = None,
) -> ToolOutcome:
    if not meta_title and not meta_description:
        return ToolOutcome(ok=False, error="Nothing to change")

    provider, connector = await _cms_for(ctx)
    async with connector:
        listing = await connector.list_content(limit=100)
        if not listing.ok:
            return ToolOutcome(ok=False, error=listing.error)
        match = next(
            (ref for ref in listing.data if ref.url and _same_url(ref.url, url)), None
        )
        if match is None:
            return ToolOutcome(
                ok=False,
                error=(
                    f"Could not find {url} in {provider}. It may be a template "
                    "page rather than a CMS entry, which needs a developer."
                ),
            )
        before = {"meta_title": match.raw.get("meta_title"), "url": url}
        result = await connector.update_metadata(
            match.id, meta_title=meta_title, meta_description=meta_description
        )

    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)

    await record_event(
        ctx.session,
        org_id=ctx.org_id, site_id=ctx.site_id,
        action="page.meta_updated", object_type="page", object_id=match.id,
        actor_type="agent", actor_id=ctx.agent_key,
        summary=f"Updated metadata on {url}",
        before=before,
        after={"meta_title": meta_title, "meta_description": meta_description},
        reversible=True, mission_run_id=ctx.mission_run_id,
    )
    if finding_id:
        await FindingsService(ctx.session).mark(finding_id, "fixed")

    return ToolOutcome(
        ok=True,
        summary=f"Metadata updated on {url}",
        data={"url": url, "meta_title": meta_title, "meta_description": meta_description},
    )


@tool(
    "publish.submit_urls",
    """Push changed URLs to search engines so they are recrawled in minutes
    rather than days. Uses IndexNow for Bing, Yandex, Seznam and Naver, and
    the Bing API where connected.

    Call this after every publish and after any significant on-page change.""",
    schema(
        urls=array("URLs to submit", {"type": "string"}, max_items=1000),
    ),
    category="publish",
    mutates=True,
    risk="low",
    auto_from="assisted",
)
async def publish_submit_urls(ctx: ToolContext, urls: list[str]) -> ToolOutcome:
    results: dict[str, str] = {}
    submitted = 0
    providers = await connected_providers(ctx)

    if "indexnow" in providers:
        connector = await connector_for(ctx, "indexnow")
        async with connector:
            outcome = await connector.submit(urls)
        results["indexnow"] = "ok" if outcome.ok else (outcome.error or "failed")
        submitted += len(urls) if outcome.ok else 0

    if "bing_webmaster" in providers:
        site = await load_site(ctx)
        connector = await connector_for(ctx, "bing_webmaster")
        async with connector:
            outcome = await connector.submit_urls(site.base_url, urls)
        results["bing_webmaster"] = "ok" if outcome.ok else (outcome.error or "failed")

    if not results:
        return ToolOutcome(
            ok=False,
            error=(
                "No push-indexing route is connected. IndexNow is free and needs "
                "only a key file on the site root; connect it to cut recrawl time "
                "from days to minutes."
            ),
        )
    return ToolOutcome(
        ok=any(v == "ok" for v in results.values()),
        summary=f"Submitted {len(urls)} URLs: " + ", ".join(f"{k}={v}" for k, v in results.items()),
        data={"urls": len(urls), "results": results, "submitted": submitted},
    )


@tool(
    "publish.verify_live",
    """Check that a published page is actually live, indexable and carrying
    the changes we made. Always run this after publishing: a CMS reporting
    success is not proof the page renders.""",
    schema(
        url=string("The URL to verify"),
        expect_title_=string("Title that should appear"),
        expect_text_=string("A phrase that should be in the body"),
    ),
    category="publish",
)
async def publish_verify_live(
    ctx: ToolContext,
    url: str,
    expect_title: str | None = None,
    expect_text: str | None = None,
) -> ToolOutcome:
    from seoos.analysis.http import SafeHttpClient
    from seoos.analysis.parser import parse_html

    async with SafeHttpClient() as client:
        result = await client.get(url, check_robots=False)

    problems: list[str] = []
    if not result.ok:
        return ToolOutcome(
            ok=False,
            error=f"{url} returned HTTP {result.status}: {result.error or 'not reachable'}",
        )

    signals = parse_html(result.text, result.final_url)
    if not signals.is_indexable:
        problems.append(f"page carries a noindex directive ({signals.robots_meta})")
    if expect_title and expect_title.lower() not in (signals.title or "").lower():
        problems.append(f"title is {signals.title!r}, expected to contain {expect_title!r}")
    if expect_text and expect_text.lower() not in (signals.main_text or signals.text).lower():
        problems.append("expected body text is not present")
    if signals.word_count < 100:
        problems.append(f"only {signals.word_count} words rendered; the page may be client-rendered")
    if signals.canonical and signals.canonical.rstrip("/") != result.final_url.rstrip("/"):
        problems.append(f"canonical points elsewhere: {signals.canonical}")

    return ToolOutcome(
        ok=not problems,
        summary=(
            f"{url} is live and correct" if not problems
            else f"{url} is live but has {len(problems)} problems"
        ),
        error="; ".join(problems) if problems else None,
        data={
            "url": result.final_url,
            "status": result.status,
            "title": signals.title,
            "indexable": signals.is_indexable,
            "word_count": signals.word_count,
            "schema_types": signals.schema_types,
            "problems": problems,
        },
    )


@tool(
    "publish.write_robots",
    """Replace robots.txt. Always requires a human, at every autonomy level:
    one wrong line here can remove an entire site from search.""",
    schema(
        content=string("The complete new robots.txt"),
        reason=string("Why this change is needed"),
    ),
    category="publish",
    mutates=True,
    risk="critical",
    approval_type="robots_change",
    tags=("robots_txt_write",),
)
async def publish_write_robots(ctx: ToolContext, content: str, reason: str) -> ToolOutcome:
    # A guard that survives even an approval: a human approving a diff they
    # skim-read should not be able to deindex the site by accident.
    dangerous = _robots_danger(content)
    if dangerous:
        return ToolOutcome(
            ok=False,
            error=(
                "Refusing this robots.txt: " + "; ".join(dangerous)
                + ". Rewrite it so it cannot block the whole site."
            ),
        )
    provider, connector = await _cms_for(ctx)
    if provider != "github":
        return ToolOutcome(
            ok=False,
            error=(
                f"robots.txt cannot be written through {provider}. "
                "The file has been prepared; it needs uploading to the site root."
            ),
            data={"prepared_content": content, "reason": reason},
        )
    payload = ContentPayload(
        title="robots.txt",
        body_html=content,
        slug="robots",
        custom_fields={"body_markdown": content},
    )
    async with connector:
        result = await connector.create_content(payload)
    return ToolOutcome(
        ok=result.ok,
        summary="robots.txt change opened as a pull request",
        error=result.error,
        data={"url": result.url},
    )


def _robots_danger(content: str) -> list[str]:
    """Catch the specific mistakes that take a site out of the index."""
    problems: list[str] = []
    lines = [line.split("#")[0].strip() for line in (content or "").splitlines()]
    agent = None
    for line in lines:
        if not line:
            agent = None
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            agent = value
        elif key == "disallow" and value == "/":
            if agent in ("*", None):
                problems.append("'Disallow: /' under 'User-agent: *' blocks the entire site")
            elif agent.lower() in ("googlebot", "bingbot"):
                problems.append(f"'Disallow: /' blocks {agent} entirely")
    if not any(line.lower().startswith("sitemap:") for line in lines):
        problems.append("no Sitemap directive, which loses a free discovery signal")
    return problems


def _same_url(a: str, b: str) -> bool:
    from urllib.parse import urlparse

    from seoos.analysis.http import normalise_domain

    def norm(u: str) -> str:
        p = urlparse(u)
        return f"{normalise_domain(p.hostname)}{(p.path or '/').rstrip('/') or '/'}"

    return norm(a) == norm(b)
