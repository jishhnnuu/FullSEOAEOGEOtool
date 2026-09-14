"""Market data: SERPs, keywords, backlinks.

Every provider here is optional. The platform is designed so a client with no
data subscription still gets a full technical, content and AEO programme from
first-party sources (their own site, Search Console, Analytics); paid data
makes the keyword and competitor work sharper rather than making the product
work at all.

DataForSEO is the default recommendation because it is pay-as-you-go with no
seat cost, which suits a platform billing many small clients far better than
a per-seat enterprise contract.
"""

from __future__ import annotations

import base64
from datetime import date
from typing import Any

from seoos.connectors.base import Capability, Connector, ConnectorResult
from seoos.core.errors import ConnectorError
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.data")


class DataForSEOConnector(Connector):
    provider = "dataforseo"
    display_name = "DataForSEO"
    auth_kind = "basic"
    docs_url = "https://docs.dataforseo.com/v3/"
    capabilities = (
        Capability("serp", "Live and cached SERPs for any keyword and location"),
        Capability("keywords", "Search volume, difficulty and related terms"),
        Capability("backlinks", "Referring domains, anchors and lost links"),
        Capability("competitors", "Domain overlap and ranking distribution"),
        Capability("llm_mentions", "Brand mentions inside AI answers"),
        Capability("local_pack", "Map pack results for a coordinate"),
    )
    BASE = "https://api.dataforseo.com/v3"

    # Published list prices, used for budgeting before a call is made. The
    # cost ledger records what was actually spent; this is the estimate the
    # cost controller uses to decide whether a call is worth making.
    UNIT_COSTS = {
        "serp_task": 0.0006,
        "serp_live": 0.002,
        "keywords_volume": 0.0001,
        "backlinks_summary": 0.02,
        "backlinks_row": 0.00003,
        "llm_mentions": 0.005,
    }

    def _headers(self) -> dict[str, str]:
        self.require("login", "password")
        token = base64.b64encode(
            f"{self.credentials['login']}:{self.credentials['password']}".encode()
        ).decode()
        return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}

    async def _post(self, path: str, payload: list[dict]) -> Any:
        data = await self.request(
            "POST", f"{self.BASE}{path}", headers=self._headers(), json=payload, timeout=120
        )
        if data.get("status_code") != 20000:
            raise ConnectorError(
                f"DataForSEO error {data.get('status_code')}: {data.get('status_message')}"
            )
        tasks = data.get("tasks") or []
        if not tasks:
            return []
        task = tasks[0]
        if task.get("status_code") not in (20000, 20100):
            raise ConnectorError(
                f"DataForSEO task error: {task.get('status_message')}"
            )
        return task.get("result") or []

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.BASE}/appendix/user_data", headers=self._headers()
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        result = ((data.get("tasks") or [{}])[0].get("result") or [{}])[0]
        balance = (result.get("money") or {}).get("balance")
        return ConnectorResult(
            ok=True,
            data={"balance_usd": balance, "rates": result.get("rates")},
            degraded=bool(balance is not None and balance < 5),
            meta={"note": "Balance is low"} if (balance or 0) < 5 else {},
        )

    async def serp(
        self,
        keyword: str,
        *,
        location_code: int = 2840,
        language_code: str = "en",
        device: str = "desktop",
        depth: int = 20,
    ) -> ConnectorResult:
        result = await self._post(
            "/serp/google/organic/live/advanced",
            [{
                "keyword": keyword,
                "location_code": location_code,
                "language_code": language_code,
                "device": device,
                "depth": depth,
                "people_also_ask_click_depth": 1,
            }],
        )
        if not result:
            return ConnectorResult.failure("No SERP returned")
        items = result[0].get("items") or []
        organic = [
            {
                "position": item.get("rank_absolute"),
                "url": item.get("url"),
                "domain": item.get("domain"),
                "title": item.get("title"),
                "description": item.get("description"),
            }
            for item in items if item.get("type") == "organic"
        ]
        features = sorted({item.get("type") for item in items if item.get("type") != "organic"})
        paa = [
            q.get("title")
            for item in items if item.get("type") == "people_also_ask"
            for q in (item.get("items") or [])
        ]
        return ConnectorResult(
            ok=True,
            data={
                "keyword": keyword,
                "organic": organic,
                "serp_features": features,
                "people_also_ask": [q for q in paa if q][:10],
                "has_ai_overview": "ai_overview" in features,
                "total_results": result[0].get("se_results_count"),
            },
            cost_usd=self.UNIT_COSTS["serp_live"],
        )

    async def keyword_data(
        self, keywords: list[str], *, location_code: int = 2840, language_code: str = "en"
    ) -> ConnectorResult:
        result = await self._post(
            "/keywords_data/google_ads/search_volume/live",
            [{
                "keywords": keywords[:1000],
                "location_code": location_code,
                "language_code": language_code,
            }],
        )
        rows = [
            {
                "keyword": row.get("keyword"),
                "volume": row.get("search_volume"),
                "cpc": row.get("cpc"),
                "competition": row.get("competition_index"),
                "monthly": row.get("monthly_searches"),
            }
            for row in result
        ]
        return ConnectorResult(
            ok=True, data=rows,
            cost_usd=self.UNIT_COSTS["keywords_volume"] * len(keywords),
        )

    async def keyword_ideas(
        self, seed: str, *, location_code: int = 2840, language_code: str = "en", limit: int = 200
    ) -> ConnectorResult:
        result = await self._post(
            "/dataforseo_labs/google/keyword_ideas/live",
            [{
                "keywords": [seed],
                "location_code": location_code,
                "language_code": language_code,
                "limit": limit,
            }],
        )
        items = (result[0].get("items") if result else []) or []
        return ConnectorResult(
            ok=True,
            data=[
                {
                    "keyword": item.get("keyword"),
                    "volume": (item.get("keyword_info") or {}).get("search_volume"),
                    "cpc": (item.get("keyword_info") or {}).get("cpc"),
                    "difficulty": (item.get("keyword_properties") or {}).get(
                        "keyword_difficulty"
                    ),
                    "intent": (item.get("search_intent_info") or {}).get("main_intent"),
                }
                for item in items
            ],
        )

    async def backlinks_summary(self, target: str) -> ConnectorResult:
        result = await self._post(
            "/backlinks/summary/live",
            [{"target": target, "internal_list_limit": 10, "include_subdomains": True}],
        )
        if not result:
            return ConnectorResult.failure("No backlink summary returned")
        row = result[0]
        return ConnectorResult(
            ok=True,
            data={
                "target": target,
                "backlinks": row.get("backlinks"),
                "referring_domains": row.get("referring_domains"),
                "referring_main_domains": row.get("referring_main_domains"),
                "rank": row.get("rank"),
                "broken_backlinks": row.get("broken_backlinks"),
                "referring_links_types": row.get("referring_links_types"),
                "dofollow": (row.get("referring_links_attributes") or {}).get("dofollow"),
            },
            cost_usd=self.UNIT_COSTS["backlinks_summary"],
        )

    async def backlinks(self, target: str, *, limit: int = 500) -> ConnectorResult:
        result = await self._post(
            "/backlinks/backlinks/live",
            [{
                "target": target, "limit": limit, "mode": "as_is",
                "filters": [["dofollow", "=", True]],
                "order_by": ["rank,desc"],
            }],
        )
        items = (result[0].get("items") if result else []) or []
        return ConnectorResult(
            ok=True,
            data=[
                {
                    "source_url": item.get("url_from"),
                    "source_domain": item.get("domain_from"),
                    "target_url": item.get("url_to"),
                    "anchor": item.get("anchor"),
                    "dofollow": item.get("dofollow"),
                    "first_seen": item.get("first_seen"),
                    "rank": item.get("rank"),
                    "spam_score": item.get("backlink_spam_score"),
                    "page_from_language": item.get("page_from_language"),
                }
                for item in items
            ],
            cost_usd=self.UNIT_COSTS["backlinks_summary"]
            + self.UNIT_COSTS["backlinks_row"] * len(items),
        )

    async def local_pack(
        self, keyword: str, *, latitude: float, longitude: float, language_code: str = "en"
    ) -> ConnectorResult:
        """Map pack at a specific coordinate.

        Local rank is a function of where the searcher stands, so a single
        city-level check is close to meaningless. This is the primitive the
        geo-grid agent samples across a lattice of points.
        """
        result = await self._post(
            "/serp/google/maps/live/advanced",
            [{
                "keyword": keyword,
                "location_coordinate": f"{latitude},{longitude},15z",
                "language_code": language_code,
            }],
        )
        items = (result[0].get("items") if result else []) or []
        return ConnectorResult(
            ok=True,
            data=[
                {
                    "position": item.get("rank_absolute"),
                    "title": item.get("title"),
                    "domain": item.get("domain"),
                    "rating": item.get("rating", {}).get("value") if item.get("rating") else None,
                    "reviews": item.get("rating", {}).get("votes_count") if item.get("rating") else None,
                    "place_id": item.get("place_id"),
                    "category": item.get("category"),
                }
                for item in items if item.get("type") == "maps_search"
            ],
            cost_usd=self.UNIT_COSTS["serp_live"],
        )


class MozConnector(Connector):
    provider = "moz"
    display_name = "Moz Links API"
    auth_kind = "basic"
    docs_url = "https://moz.com/api/docs"
    capabilities = (
        Capability("domain_authority", "Domain and page authority, spam score"),
        Capability("linking_domains", "Referring domains and top anchors"),
    )
    BASE = "https://lsapi.seomoz.com/v2"

    def _headers(self) -> dict[str, str]:
        self.require("access_id", "secret_key")
        token = base64.b64encode(
            f"{self.credentials['access_id']}:{self.credentials['secret_key']}".encode()
        ).decode()
        return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}

    async def verify(self) -> ConnectorResult:
        try:
            result = await self.url_metrics(["https://moz.com"])
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=result.ok, data={"sample": result.data})

    async def url_metrics(self, targets: list[str]) -> ConnectorResult:
        data = await self.request(
            "POST", f"{self.BASE}/url_metrics",
            headers=self._headers(), json={"targets": targets[:50]},
        )
        return ConnectorResult(
            ok=True,
            data=[
                {
                    "url": row.get("page"),
                    "domain_authority": row.get("domain_authority"),
                    "page_authority": row.get("page_authority"),
                    "spam_score": row.get("spam_score"),
                    "linking_domains": row.get("root_domains_to_page"),
                    "external_links": row.get("external_pages_to_page"),
                }
                for row in data.get("results", [])
            ],
        )


class SerperConnector(Connector):
    """A cheap SERP source. Useful as the resolver's fallback when the primary
    provider is unavailable, and for low-volume checks where a full SERP API
    is overkill."""

    provider = "serper"
    display_name = "Serper"
    auth_kind = "api_key"
    docs_url = "https://serper.dev/"
    capabilities = (Capability("serp", "Google SERP results"),)
    BASE = "https://google.serper.dev"

    def _headers(self) -> dict[str, str]:
        self.require("api_key")
        return {"X-API-KEY": self.credentials["api_key"], "Content-Type": "application/json"}

    async def verify(self) -> ConnectorResult:
        try:
            await self.search("test")
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"ready": True})

    async def search(self, query: str, *, country: str = "us", num: int = 20) -> ConnectorResult:
        data = await self.request(
            "POST", f"{self.BASE}/search",
            headers=self._headers(),
            json={"q": query, "gl": country, "num": num},
        )
        return ConnectorResult(
            ok=True,
            data={
                "keyword": query,
                "organic": [
                    {
                        "position": row.get("position"),
                        "url": row.get("link"),
                        "domain": _domain(row.get("link", "")),
                        "title": row.get("title"),
                        "description": row.get("snippet"),
                    }
                    for row in data.get("organic", [])
                ],
                "people_also_ask": [q.get("question") for q in data.get("peopleAlsoAsk", [])],
                "related": [r.get("query") for r in data.get("relatedSearches", [])],
                "serp_features": [
                    key for key in ("answerBox", "knowledgeGraph", "topStories", "images")
                    if data.get(key)
                ],
            },
            cost_usd=0.001,
        )


class BingWebmasterConnector(Connector):
    provider = "bing_webmaster"
    display_name = "Bing Webmaster Tools"
    auth_kind = "api_key"
    docs_url = "https://learn.microsoft.com/en-us/bingwebmaster/"
    capabilities = (
        Capability("query_stats", "Query and page performance on Bing"),
        Capability("crawl_stats", "Crawl errors and index coverage"),
        Capability("submit_urls", "Submit URLs for crawling", write=True),
        Capability("inbound_links", "Referring domains as Bing sees them"),
    )
    BASE = "https://ssl.bing.com/webmaster/api.svc/json"

    async def verify(self) -> ConnectorResult:
        self.require("api_key")
        try:
            data = await self.request(
                "GET", f"{self.BASE}/GetUserSites", params={"apikey": self.credentials["api_key"]}
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        sites = (data.get("d") or [])
        return ConnectorResult(ok=True, data={"sites": [s.get("Url") for s in sites]})

    async def submit_urls(self, site_url: str, urls: list[str]) -> ConnectorResult:
        self.require("api_key")
        try:
            await self.request(
                "POST", f"{self.BASE}/SubmitUrlBatch",
                params={"apikey": self.credentials["api_key"]},
                json={"siteUrl": site_url, "urlList": urls[:500]},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"submitted": len(urls[:500])})


class IndexNowConnector(Connector):
    """IndexNow. No account, no auth beyond a key file the client hosts.

    Worth having because it is the only push-indexing route that works across
    Bing, Yandex, Seznam and Naver at once, costs nothing, and takes effect in
    minutes rather than waiting for a crawl.
    """

    provider = "indexnow"
    display_name = "IndexNow"
    auth_kind = "api_key"
    docs_url = "https://www.indexnow.org/documentation"
    capabilities = (Capability("submit_urls", "Push changed URLs to search engines", write=True),)
    ENDPOINT = "https://api.indexnow.org/IndexNow"

    async def verify(self) -> ConnectorResult:
        key = self.credentials.get("key")
        host = self.config.get("host")
        if not key or not host:
            return ConnectorResult.failure("IndexNow needs a key and a host")
        # The key file must be reachable at the site root or submissions are
        # silently ignored, so verification checks the file, not the API.
        from seoos.analysis.http import SafeHttpClient

        async with SafeHttpClient() as client:
            probe = await client.get(f"https://{host}/{key}.txt", check_robots=False)
        if not probe.ok or key not in (probe.text or ""):
            return ConnectorResult.failure(
                f"The key file is not readable at https://{host}/{key}.txt. "
                "Upload a text file with that name containing the key."
            )
        return ConnectorResult(ok=True, data={"host": host, "key_file_verified": True})

    async def submit(self, urls: list[str]) -> ConnectorResult:
        self.require("key")
        host = self.config.get("host")
        if not host:
            return ConnectorResult.failure("IndexNow host is not configured")
        try:
            await self.request(
                "POST", self.ENDPOINT,
                json={
                    "host": host,
                    "key": self.credentials["key"],
                    "keyLocation": f"https://{host}/{self.credentials['key']}.txt",
                    "urlList": urls[:10000],
                },
                expect_json=False,
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(
            ok=True,
            data={"submitted": len(urls[:10000]), "engines": ["bing", "yandex", "seznam", "naver"]},
        )


def _domain(url: str) -> str:
    from urllib.parse import urlparse

    return (urlparse(url).hostname or "").lower()


def today() -> date:
    return date.today()
