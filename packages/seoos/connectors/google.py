"""Google connectors: Search Console, Analytics 4, Business Profile, PageSpeed.

Search Console is the single most valuable connection a client can make, so
it is worth being precise about: it is the only first-party source of what
queries a site actually appears for, and everything the strategist does is
better with it and guesswork without it.

Business Profile deserves a note. Google requires a separate, manually
approved access request before a project gets any quota at all, and new
projects start at zero. The connector therefore reports a clear, actionable
status when quota is missing rather than a raw 403, because "apply for
Business Profile API access" is a real onboarding step, not a bug.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from seoos.connectors.base import Capability, Connector, ConnectorResult, OAuthConnector
from seoos.core.errors import ConnectorError, CredentialMissing
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.google")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

SCOPES = {
    "search_console": ["https://www.googleapis.com/auth/webmasters.readonly"],
    "search_console_write": ["https://www.googleapis.com/auth/webmasters"],
    "analytics": ["https://www.googleapis.com/auth/analytics.readonly"],
    "business_profile": ["https://www.googleapis.com/auth/business.manage"],
    "indexing": ["https://www.googleapis.com/auth/indexing"],
    "youtube": ["https://www.googleapis.com/auth/youtube.readonly"],
}


class GoogleSearchConsoleConnector(OAuthConnector):
    provider = "google_search_console"
    display_name = "Google Search Console"
    token_url = GOOGLE_TOKEN_URL
    authorize_url = GOOGLE_AUTH_URL
    default_scopes = tuple(SCOPES["search_console"])
    docs_url = "https://developers.google.com/webmaster-tools/v1/api_reference_index"
    capabilities = (
        Capability("queries", "Query, page, country and device performance"),
        Capability("indexing_status", "Per-URL index coverage via URL Inspection"),
        Capability("sitemaps", "Submitted sitemaps and their processing state"),
        Capability("submit_sitemap", "Submit a sitemap", read=False, write=True),
    )
    BASE = "https://searchconsole.googleapis.com"

    @property
    def site_url(self) -> str:
        value = self.config.get("site_url") or self.credentials.get("site_url")
        if not value:
            raise CredentialMissing(
                "No Search Console property selected for this site",
                context={"provider": self.provider},
            )
        return value

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET",
                f"{self.BASE}/webmasters/v3/sites",
                headers=await self.auth_headers(),
            )
        except (ConnectorError, CredentialMissing) as exc:
            return ConnectorResult.failure(exc.message)
        entries = data.get("siteEntry", []) or []
        return ConnectorResult(
            ok=True,
            data={
                "properties": [
                    {"site_url": e.get("siteUrl"), "permission": e.get("permissionLevel")}
                    for e in entries
                ]
            },
            meta={"count": len(entries)},
        )

    async def query(
        self,
        *,
        start_date: date,
        end_date: date,
        dimensions: list[str] | None = None,
        filters: list[dict] | None = None,
        row_limit: int = 1000,
        search_type: str = "web",
        start_row: int = 0,
    ) -> ConnectorResult:
        body: dict[str, Any] = {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "dimensions": dimensions or ["query"],
            "rowLimit": min(row_limit, 25000),
            "startRow": start_row,
            "type": search_type,
            # Discover and News rows behave differently enough that mixing
            # them into a "web" report produces nonsense averages.
            "dataState": "final",
        }
        if filters:
            body["dimensionFilterGroups"] = [{"filters": filters}]

        import urllib.parse

        encoded = urllib.parse.quote(self.site_url, safe="")
        data = await self.request(
            "POST",
            f"{self.BASE}/webmasters/v3/sites/{encoded}/searchAnalytics/query",
            headers=await self.auth_headers(),
            json=body,
        )
        dims = body["dimensions"]
        rows = [
            {
                **{dims[i]: key for i, key in enumerate(row.get("keys", []))},
                "clicks": row.get("clicks", 0),
                "impressions": row.get("impressions", 0),
                "ctr": row.get("ctr", 0.0),
                "position": row.get("position", 0.0),
            }
            for row in data.get("rows", [])
        ]
        return ConnectorResult(ok=True, data=rows, meta={"rows": len(rows), "dimensions": dims})

    async def page_metrics(self, *, days: int = 28, limit: int = 5000) -> ConnectorResult:
        """Per-URL performance, keyed by URL, for joining onto a crawl."""
        end = date.today() - timedelta(days=2)  # GSC lags about two days
        result = await self.query(
            start_date=end - timedelta(days=days),
            end_date=end,
            dimensions=["page"],
            row_limit=limit,
        )
        if not result.ok:
            return result
        return ConnectorResult(
            ok=True,
            data={row["page"]: row for row in result.data},
            meta={"days": days, "urls": len(result.data)},
        )

    async def striking_distance(
        self, *, days: int = 28, min_impressions: int = 50, low: float = 4.0, high: float = 20.0
    ) -> ConnectorResult:
        """Queries ranking just below the traffic cliff.

        Positions 4 to 20 with real impressions are where the cheapest wins
        live: the page already qualifies, it just is not winning yet.
        """
        end = date.today() - timedelta(days=2)
        result = await self.query(
            start_date=end - timedelta(days=days),
            end_date=end,
            dimensions=["query", "page"],
            row_limit=25000,
        )
        if not result.ok:
            return result
        from seoos.analysis.scoring import expected_ctr, opportunity_score

        candidates = []
        for row in result.data:
            if row["impressions"] < min_impressions:
                continue
            if not (low <= row["position"] <= high):
                continue
            candidates.append(
                {
                    **row,
                    "expected_ctr_at_3": expected_ctr(3),
                    "potential_clicks": int(row["impressions"] * expected_ctr(3)) - row["clicks"],
                    "opportunity": opportunity_score(
                        impressions=row["impressions"],
                        clicks=row["clicks"],
                        position=row["position"],
                        ctr=row["ctr"],
                    ),
                }
            )
        candidates.sort(key=lambda r: r["opportunity"], reverse=True)
        return ConnectorResult(ok=True, data=candidates[:500], meta={"found": len(candidates)})

    async def low_ctr_pages(self, *, days: int = 28, min_impressions: int = 200) -> ConnectorResult:
        """Pages that rank but do not get clicked. Almost always a title problem,
        which makes them the cheapest fix in the whole discipline."""
        end = date.today() - timedelta(days=2)
        result = await self.query(
            start_date=end - timedelta(days=days),
            end_date=end,
            dimensions=["page"],
            row_limit=5000,
        )
        if not result.ok:
            return result
        from seoos.analysis.scoring import expected_ctr

        out = []
        for row in result.data:
            if row["impressions"] < min_impressions or row["position"] > 20:
                continue
            expected = expected_ctr(row["position"])
            if expected and row["ctr"] < expected * 0.6:
                out.append(
                    {
                        **row,
                        "expected_ctr": round(expected, 4),
                        "ctr_gap_pct": round((expected - row["ctr"]) / expected * 100, 1),
                        "missed_clicks": int((expected - row["ctr"]) * row["impressions"]),
                    }
                )
        out.sort(key=lambda r: r["missed_clicks"], reverse=True)
        return ConnectorResult(ok=True, data=out[:200], meta={"found": len(out)})

    async def inspect_url(self, url: str) -> ConnectorResult:
        data = await self.request(
            "POST",
            f"{self.BASE}/v1/urlInspection/index:inspect",
            headers=await self.auth_headers(),
            json={"inspectionUrl": url, "siteUrl": self.site_url},
        )
        result = (data.get("inspectionResult") or {})
        index = result.get("indexStatusResult") or {}
        return ConnectorResult(
            ok=True,
            data={
                "url": url,
                "verdict": index.get("verdict"),
                "coverage_state": index.get("coverageState"),
                "robots_state": index.get("robotsTxtState"),
                "indexing_state": index.get("indexingState"),
                "google_canonical": index.get("googleCanonical"),
                "user_canonical": index.get("userCanonical"),
                "last_crawl": index.get("lastCrawlTime"),
                "mobile_usability": (result.get("mobileUsabilityResult") or {}).get("verdict"),
                "rich_results": (result.get("richResultsResult") or {}).get("verdict"),
            },
        )

    async def list_sitemaps(self) -> ConnectorResult:
        import urllib.parse

        encoded = urllib.parse.quote(self.site_url, safe="")
        data = await self.request(
            "GET",
            f"{self.BASE}/webmasters/v3/sites/{encoded}/sitemaps",
            headers=await self.auth_headers(),
        )
        return ConnectorResult(ok=True, data=data.get("sitemap", []))

    async def submit_sitemap(self, sitemap_url: str) -> ConnectorResult:
        import urllib.parse

        site = urllib.parse.quote(self.site_url, safe="")
        feed = urllib.parse.quote(sitemap_url, safe="")
        await self.request(
            "PUT",
            f"{self.BASE}/webmasters/v3/sites/{site}/sitemaps/{feed}",
            headers=await self.auth_headers(),
            expect_json=False,
        )
        return ConnectorResult(ok=True, data={"submitted": sitemap_url})


class GoogleAnalyticsConnector(OAuthConnector):
    provider = "google_analytics_4"
    display_name = "Google Analytics 4"
    token_url = GOOGLE_TOKEN_URL
    authorize_url = GOOGLE_AUTH_URL
    default_scopes = tuple(SCOPES["analytics"])
    docs_url = "https://developers.google.com/analytics/devguides/reporting/data/v1"
    capabilities = (
        Capability("traffic", "Sessions and users by channel and landing page"),
        Capability("conversions", "Key events and revenue by landing page"),
        Capability("engagement", "Engagement rate and average engagement time"),
    )
    BASE = "https://analyticsdata.googleapis.com/v1beta"
    ADMIN = "https://analyticsadmin.googleapis.com/v1beta"

    @property
    def property_id(self) -> str:
        value = self.config.get("property_id") or self.credentials.get("property_id")
        if not value:
            raise CredentialMissing("No GA4 property selected for this site")
        return str(value).replace("properties/", "")

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET",
                f"{self.ADMIN}/accountSummaries",
                headers=await self.auth_headers(),
            )
        except (ConnectorError, CredentialMissing) as exc:
            return ConnectorResult.failure(exc.message)
        properties = [
            {"property": p.get("property"), "display_name": p.get("displayName")}
            for summary in data.get("accountSummaries", [])
            for p in summary.get("propertySummaries", [])
        ]
        return ConnectorResult(ok=True, data={"properties": properties})

    async def report(
        self,
        *,
        start_date: date,
        end_date: date,
        dimensions: list[str],
        metrics: list[str],
        dimension_filter: dict | None = None,
        limit: int = 1000,
    ) -> ConnectorResult:
        body: dict[str, Any] = {
            "dateRanges": [{"startDate": start_date.isoformat(), "endDate": end_date.isoformat()}],
            "dimensions": [{"name": d} for d in dimensions],
            "metrics": [{"name": m} for m in metrics],
            "limit": limit,
        }
        if dimension_filter:
            body["dimensionFilter"] = dimension_filter
        data = await self.request(
            "POST",
            f"{self.BASE}/properties/{self.property_id}:runReport",
            headers=await self.auth_headers(),
            json=body,
        )
        rows = []
        for row in data.get("rows", []):
            entry = {
                dimensions[i]: v.get("value")
                for i, v in enumerate(row.get("dimensionValues", []))
            }
            entry.update(
                {
                    metrics[i]: _num(v.get("value"))
                    for i, v in enumerate(row.get("metricValues", []))
                }
            )
            rows.append(entry)
        return ConnectorResult(ok=True, data=rows, meta={"rows": len(rows)})

    async def organic_landing_pages(self, *, days: int = 28) -> ConnectorResult:
        """Organic sessions, conversions and revenue by landing page.

        This is what turns a ranking report into a business report: it is the
        only way to say which of the pages we shipped actually earned money.
        """
        end = date.today()
        return await self.report(
            start_date=end - timedelta(days=days),
            end_date=end,
            dimensions=["landingPagePlusQueryString"],
            metrics=["sessions", "engagedSessions", "conversions", "totalRevenue", "bounceRate"],
            dimension_filter={
                "filter": {
                    "fieldName": "sessionDefaultChannelGroup",
                    "stringFilter": {"value": "Organic Search", "matchType": "EXACT"},
                }
            },
            limit=2000,
        )


class GoogleBusinessProfileConnector(OAuthConnector):
    provider = "google_business_profile"
    display_name = "Google Business Profile"
    token_url = GOOGLE_TOKEN_URL
    authorize_url = GOOGLE_AUTH_URL
    default_scopes = tuple(SCOPES["business_profile"])
    docs_url = "https://developers.google.com/my-business"
    capabilities = (
        Capability("locations", "Read and update location details"),
        Capability("reviews", "Read reviews and post replies", write=True),
        Capability("posts", "Publish updates, offers and events", write=True),
        Capability("performance", "Views, searches and actions per location"),
        Capability("questions", "Read and answer Q&A", write=True),
    )
    ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1"
    INFO = "https://mybusinessbusinessinformation.googleapis.com/v1"
    PERF = "https://businessprofileperformance.googleapis.com/v1"
    LEGACY = "https://mybusiness.googleapis.com/v4"

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.ACCOUNTS}/accounts", headers=await self.auth_headers()
            )
        except ConnectorError as exc:
            # Zero quota is the normal state for a project that has not been
            # through Google's manual access review. Saying so plainly turns a
            # mysterious failure into a checklist item.
            if "quota" in exc.message.lower() or "has not been used" in exc.message.lower():
                return ConnectorResult.failure(
                    "Business Profile API access has not been granted for this "
                    "deployment's Google Cloud project. Google requires a one-off "
                    "access request, and new projects start at zero quota. "
                    "Until it is approved, local work runs on public data and the "
                    "platform drafts posts and replies for manual publication.",
                    remedy="request_gbp_api_access",
                )
            return ConnectorResult.failure(exc.message)
        accounts = data.get("accounts", []) or []
        return ConnectorResult(ok=True, data={"accounts": accounts})

    async def list_locations(self, account: str) -> ConnectorResult:
        fields = (
            "name,title,storefrontAddress,phoneNumbers,categories,websiteUri,"
            "regularHours,latlng,metadata,profile,serviceItems,openInfo"
        )
        data = await self.request(
            "GET",
            f"{self.INFO}/{account}/locations",
            headers=await self.auth_headers(),
            params={"readMask": fields, "pageSize": 100},
        )
        return ConnectorResult(ok=True, data=data.get("locations", []))

    async def list_reviews(self, account: str, location: str) -> ConnectorResult:
        data = await self.request(
            "GET",
            f"{self.LEGACY}/{account}/{location}/reviews",
            headers=await self.auth_headers(),
            params={"pageSize": 50, "orderBy": "updateTime desc"},
        )
        return ConnectorResult(
            ok=True,
            data=[
                {
                    "external_id": r.get("reviewId"),
                    "author": (r.get("reviewer") or {}).get("displayName"),
                    "rating": _star_to_int(r.get("starRating")),
                    "text": r.get("comment"),
                    "posted_at": r.get("createTime"),
                    "has_reply": bool(r.get("reviewReply")),
                }
                for r in data.get("reviews", [])
            ],
            meta={"average": data.get("averageRating"), "total": data.get("totalReviewCount")},
        )

    async def reply_to_review(self, account: str, location: str, review_id: str, text: str) -> ConnectorResult:
        await self.request(
            "PUT",
            f"{self.LEGACY}/{account}/{location}/reviews/{review_id}/reply",
            headers=await self.auth_headers(),
            json={"comment": text},
        )
        return ConnectorResult(ok=True, data={"review_id": review_id, "replied": True})

    async def create_post(self, account: str, location: str, post: dict) -> ConnectorResult:
        data = await self.request(
            "POST",
            f"{self.LEGACY}/{account}/{location}/localPosts",
            headers=await self.auth_headers(),
            json=post,
        )
        return ConnectorResult(ok=True, data={"name": data.get("name"), "state": data.get("state")})

    async def performance(self, location: str, *, days: int = 30) -> ConnectorResult:
        end = date.today()
        start = end - timedelta(days=days)
        metrics = [
            "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
            "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
            "CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS",
        ]
        params = [("dailyMetrics", m) for m in metrics] + [
            ("dailyRange.start_date.year", start.year),
            ("dailyRange.start_date.month", start.month),
            ("dailyRange.start_date.day", start.day),
            ("dailyRange.end_date.year", end.year),
            ("dailyRange.end_date.month", end.month),
            ("dailyRange.end_date.day", end.day),
        ]
        data = await self.request(
            "GET",
            f"{self.PERF}/{location}:fetchMultiDailyMetricsTimeSeries",
            headers=await self.auth_headers(),
            params=params,
        )
        return ConnectorResult(ok=True, data=data)


class PageSpeedConnector(Connector):
    """PageSpeed Insights and CrUX.

    Deliberately API-key rather than OAuth: it needs no user data, so it works
    for prospects and for competitor benchmarking, not only for connected
    clients.
    """

    provider = "pagespeed"
    display_name = "PageSpeed Insights"
    auth_kind = "api_key"
    docs_url = "https://developers.google.com/speed/docs/insights/v5/get-started"
    capabilities = (
        Capability("lab_metrics", "Lighthouse lab performance for any URL"),
        Capability("field_metrics", "Real-user Core Web Vitals from CrUX"),
    )
    PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    CRUX = "https://chromeuxreport.googleapis.com/v1/records:queryRecord"

    async def verify(self) -> ConnectorResult:
        try:
            await self.analyse("https://example.com", strategy="mobile")
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"ready": True})

    async def analyse(self, url: str, *, strategy: str = "mobile") -> ConnectorResult:
        params = {
            "url": url,
            "strategy": strategy,
            "category": ["performance", "accessibility", "seo", "best-practices"],
        }
        if self.credentials.get("api_key"):
            params["key"] = self.credentials["api_key"]
        data = await self.request("GET", self.PSI, params=params, timeout=120)

        lighthouse = data.get("lighthouseResult", {}) or {}
        audits = lighthouse.get("audits", {}) or {}
        categories = lighthouse.get("categories", {}) or {}
        loading = data.get("loadingExperience", {}) or {}
        field = loading.get("metrics", {}) or {}

        def metric(key: str) -> float | None:
            entry = audits.get(key, {}) or {}
            return entry.get("numericValue")

        return ConnectorResult(
            ok=True,
            data={
                "url": url,
                "strategy": strategy,
                "scores": {
                    name: round((cat.get("score") or 0) * 100)
                    for name, cat in categories.items()
                },
                "lab": {
                    "lcp_ms": metric("largest-contentful-paint"),
                    "fcp_ms": metric("first-contentful-paint"),
                    "tbt_ms": metric("total-blocking-time"),
                    "cls": metric("cumulative-layout-shift"),
                    "speed_index_ms": metric("speed-index"),
                    "tti_ms": metric("interactive"),
                },
                "field": {
                    "lcp_ms": (field.get("LARGEST_CONTENTFUL_PAINT_MS") or {}).get("percentile"),
                    "inp_ms": (field.get("INTERACTION_TO_NEXT_PAINT") or {}).get("percentile"),
                    "cls": _crux_cls(field.get("CUMULATIVE_LAYOUT_SHIFT_SCORE")),
                    "overall": loading.get("overall_category"),
                },
                "opportunities": [
                    {
                        "id": key,
                        "title": audit.get("title"),
                        "savings_ms": (audit.get("details") or {}).get("overallSavingsMs"),
                        "savings_bytes": (audit.get("details") or {}).get("overallSavingsBytes"),
                    }
                    for key, audit in audits.items()
                    if (audit.get("details") or {}).get("overallSavingsMs", 0) > 150
                ][:12],
            },
        )

    async def crux_history(self, origin: str, *, form_factor: str = "PHONE") -> ConnectorResult:
        if not self.credentials.get("api_key"):
            return ConnectorResult.failure("CrUX needs a Google API key")
        data = await self.request(
            "POST",
            self.CRUX,
            params={"key": self.credentials["api_key"]},
            json={"origin": origin, "formFactor": form_factor},
        )
        metrics = (data.get("record") or {}).get("metrics", {})
        return ConnectorResult(
            ok=True,
            data={
                name: {
                    "p75": entry.get("percentiles", {}).get("p75"),
                    "good_pct": round(
                        (entry.get("histogram", [{}])[0].get("density", 0) or 0) * 100, 1
                    ),
                }
                for name, entry in metrics.items()
            },
        )


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _star_to_int(star: str | None) -> int | None:
    return {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}.get(star or "")


def _crux_cls(entry: dict | None) -> float | None:
    if not entry:
        return None
    value = entry.get("percentile")
    try:
        return float(value) / 100 if value and float(value) > 1 else float(value)
    except (TypeError, ValueError):
        return None
