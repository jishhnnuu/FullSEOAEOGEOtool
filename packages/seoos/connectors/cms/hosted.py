"""WordPress, Shopify and Webflow: the three platforms most clients are on."""

from __future__ import annotations

import base64
from typing import Any

from seoos.connectors.base import Capability, ConnectorResult
from seoos.connectors.cms.base import CMSConnector, ContentPayload, PageRef, PublishResult
from seoos.core.errors import ConnectorError
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.cms")


class WordPressConnector(CMSConnector):
    """WordPress REST API with an application password.

    Application passwords are used rather than OAuth because they work on
    every self-hosted install without a plugin, which is what most clients
    have. The credential is scoped to one user and revocable from wp-admin,
    so the client keeps control.
    """

    provider = "wordpress"
    display_name = "WordPress"
    auth_kind = "app_password"
    supports_scheduling = True
    content_types = ("post", "page", "product")
    docs_url = "https://developer.wordpress.org/rest-api/"
    capabilities = CMSConnector.capabilities + (
        Capability("upload_media", "Upload images to the media library", write=True),
        Capability("taxonomies", "Read and assign categories and tags", write=True),
        Capability("yoast_rankmath", "Set SEO title and description via Yoast or Rank Math", write=True),
    )

    @property
    def base(self) -> str:
        site = (self.config.get("site_url") or self.credentials.get("site_url") or "").rstrip("/")
        if not site:
            raise ConnectorError("WordPress site URL is not configured")
        return f"{site}/wp-json/wp/v2"

    def _headers(self) -> dict[str, str]:
        self.require("username", "application_password")
        token = base64.b64encode(
            f"{self.credentials['username']}:{self.credentials['application_password']}".encode()
        ).decode()
        return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.base}/users/me", headers=self._headers()
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        capabilities = data.get("capabilities") or {}
        can_publish = bool(capabilities.get("publish_posts", True))
        return ConnectorResult(
            ok=True,
            data={
                "user": data.get("name"),
                "roles": data.get("roles"),
                "can_publish": can_publish,
            },
            degraded=not can_publish,
            meta={} if can_publish else {
                "note": "The connected user cannot publish; content will be created as drafts."
            },
        )

    async def list_content(self, *, content_type="post", limit=50, search=None) -> ConnectorResult:
        endpoint = {"post": "posts", "page": "pages", "product": "product"}.get(
            content_type, "posts"
        )
        params: dict[str, Any] = {"per_page": min(limit, 100), "status": "any", "_embed": "1"}
        if search:
            params["search"] = search
        data = await self.request(
            "GET", f"{self.base}/{endpoint}", headers=self._headers(), params=params
        )
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=str(item["id"]),
                    title=(item.get("title") or {}).get("rendered", ""),
                    url=item.get("link"),
                    slug=item.get("slug"),
                    status=item.get("status", "unknown"),
                    type=content_type,
                    modified_at=item.get("modified_gmt"),
                    excerpt=(item.get("excerpt") or {}).get("rendered"),
                    raw=item,
                )
                for item in data
            ],
        )

    async def get_content(self, content_id: str, *, content_type="post") -> ConnectorResult:
        endpoint = {"post": "posts", "page": "pages", "product": "product"}.get(
            content_type, "posts"
        )
        item = await self.request(
            "GET", f"{self.base}/{endpoint}/{content_id}", headers=self._headers(),
            params={"context": "edit"},
        )
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=str(item["id"]),
                title=(item.get("title") or {}).get("raw") or (item.get("title") or {}).get("rendered", ""),
                url=item.get("link"),
                slug=item.get("slug"),
                status=item.get("status", "unknown"),
                type=content_type,
                modified_at=item.get("modified_gmt"),
                raw=item,
            ),
        )

    def _body(self, payload: ContentPayload) -> dict:
        body: dict[str, Any] = {
            "title": payload.title,
            "status": {"published": "publish", "scheduled": "future"}.get(
                payload.status, "draft"
            ),
        }
        if payload.body_html:
            body["content"] = payload.body_html
        if payload.slug:
            body["slug"] = payload.slug
        if payload.excerpt:
            body["excerpt"] = payload.excerpt
        if payload.publish_at and payload.status == "scheduled":
            body["date_gmt"] = payload.publish_at

        # Yoast and Rank Math both read from meta; writing both keys means the
        # platform does not need to detect which plugin the client uses.
        meta: dict[str, Any] = {}
        if payload.meta_title:
            meta["_yoast_wpseo_title"] = payload.meta_title
            meta["rank_math_title"] = payload.meta_title
        if payload.meta_description:
            meta["_yoast_wpseo_metadesc"] = payload.meta_description
            meta["rank_math_description"] = payload.meta_description
        if payload.canonical_url:
            meta["_yoast_wpseo_canonical"] = payload.canonical_url
            meta["rank_math_canonical_url"] = payload.canonical_url
        if meta:
            body["meta"] = meta
        if payload.custom_fields:
            body.update(payload.custom_fields)
        return body

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        endpoint = {"post": "posts", "page": "pages", "product": "product"}.get(
            payload.content_type, "posts"
        )
        try:
            data = await self.request(
                "POST", f"{self.base}/{endpoint}", headers=self._headers(), json=self._body(payload)
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(
            ok=True,
            id=str(data.get("id")),
            url=data.get("link"),
            status=data.get("status", "unknown"),
            warnings=self._warn_unsupported(payload, ["schema_jsonld"]),
            raw=data,
        )

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        endpoint = {"post": "posts", "page": "pages", "product": "product"}.get(
            payload.content_type, "posts"
        )
        body = self._body(payload)
        if not payload.body_html:
            body.pop("content", None)  # metadata-only edit, leave the body alone
        try:
            data = await self.request(
                "POST", f"{self.base}/{endpoint}/{content_id}",
                headers=self._headers(), json=body,
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(
            ok=True, id=str(data.get("id")), url=data.get("link"),
            status=data.get("status", "unknown"), raw=data,
        )

    async def upload_media(self, *, filename, content, mime_type, alt_text=None) -> ConnectorResult:
        headers = self._headers()
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        headers["Content-Type"] = mime_type
        try:
            data = await self.request(
                "POST", f"{self.base}/media", headers=headers, content=content
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        if alt_text:
            await self.request(
                "POST", f"{self.base}/media/{data['id']}",
                headers=self._headers(), json={"alt_text": alt_text},
            )
        return ConnectorResult(
            ok=True, data={"id": data.get("id"), "url": data.get("source_url")}
        )


class ShopifyConnector(CMSConnector):
    """Shopify Admin GraphQL.

    Products, collections and blog articles all matter for commerce SEO, and
    metafields are where the SEO title and description actually live.
    """

    provider = "shopify"
    display_name = "Shopify"
    auth_kind = "token"
    content_types = ("article", "page", "product", "collection")
    docs_url = "https://shopify.dev/docs/api/admin-graphql"
    capabilities = CMSConnector.capabilities + (
        Capability("products", "Read and update product content and metafields", write=True),
        Capability("collections", "Read and update collection pages", write=True),
        Capability("metafields", "Set SEO title and description", write=True),
    )
    API_VERSION = "2025-01"

    @property
    def shop(self) -> str:
        shop = self.config.get("shop") or self.credentials.get("shop")
        if not shop:
            raise ConnectorError("Shopify shop domain is not configured")
        return shop if shop.endswith(".myshopify.com") else f"{shop}.myshopify.com"

    def _headers(self) -> dict[str, str]:
        self.require("access_token")
        return {
            "X-Shopify-Access-Token": self.credentials["access_token"],
            "Content-Type": "application/json",
        }

    async def graphql(self, query: str, variables: dict | None = None) -> dict:
        data = await self.request(
            "POST",
            f"https://{self.shop}/admin/api/{self.API_VERSION}/graphql.json",
            headers=self._headers(),
            json={"query": query, "variables": variables or {}},
        )
        if data.get("errors"):
            raise ConnectorError(f"Shopify GraphQL error: {data['errors']}")
        return data.get("data", {})

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.graphql("{ shop { name myshopifyDomain primaryDomain { url } } }")
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data=data.get("shop", {}))

    async def list_content(self, *, content_type="product", limit=50, search=None) -> ConnectorResult:
        if content_type == "product":
            query = """
            query($first: Int!, $q: String) {
              products(first: $first, query: $q) {
                edges { node {
                  id title handle status updatedAt onlineStoreUrl
                  seo { title description }
                  descriptionHtml
                } }
              }
            }"""
            data = await self.graphql(query, {"first": min(limit, 100), "q": search})
            nodes = [edge["node"] for edge in data.get("products", {}).get("edges", [])]
        else:
            query = """
            query($first: Int!) {
              articles(first: $first) {
                edges { node { id title handle publishedAt } }
              }
            }"""
            data = await self.graphql(query, {"first": min(limit, 100)})
            nodes = [edge["node"] for edge in data.get("articles", {}).get("edges", [])]

        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=node["id"],
                    title=node.get("title", ""),
                    url=node.get("onlineStoreUrl"),
                    slug=node.get("handle"),
                    status=node.get("status", "ACTIVE"),
                    type=content_type,
                    modified_at=node.get("updatedAt") or node.get("publishedAt"),
                    raw=node,
                )
                for node in nodes
            ],
        )

    async def get_content(self, content_id: str, *, content_type="product") -> ConnectorResult:
        query = """
        query($id: ID!) {
          node(id: $id) {
            ... on Product {
              id title handle status descriptionHtml onlineStoreUrl updatedAt
              seo { title description }
            }
          }
        }"""
        data = await self.graphql(query, {"id": content_id})
        node = data.get("node") or {}
        if not node:
            return ConnectorResult.failure(f"Shopify item {content_id} not found")
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=node["id"], title=node.get("title", ""), url=node.get("onlineStoreUrl"),
                slug=node.get("handle"), status=node.get("status", ""), type=content_type,
                modified_at=node.get("updatedAt"), raw=node,
            ),
        )

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        if payload.content_type != "product":
            return PublishResult(
                ok=False,
                error=(
                    "Creating Shopify articles and pages needs the Online Store "
                    "REST endpoints, which this deployment has not been granted. "
                    "Products are supported."
                ),
            )
        mutation = """
        mutation($input: ProductInput!) {
          productCreate(input: $input) {
            product { id handle onlineStoreUrl status }
            userErrors { field message }
          }
        }"""
        variables = {
            "input": {
                "title": payload.title,
                "descriptionHtml": payload.body_html,
                "handle": payload.slug,
                "status": "ACTIVE" if payload.status == "published" else "DRAFT",
                "seo": {"title": payload.meta_title, "description": payload.meta_description},
                "tags": payload.tags,
            }
        }
        try:
            data = await self.graphql(mutation, variables)
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        result = data.get("productCreate", {})
        if result.get("userErrors"):
            return PublishResult(ok=False, error=str(result["userErrors"]))
        product = result.get("product", {})
        return PublishResult(
            ok=True, id=product.get("id"), url=product.get("onlineStoreUrl"),
            status=product.get("status", ""), raw=product,
        )

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        mutation = """
        mutation($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id handle onlineStoreUrl status }
            userErrors { field message }
          }
        }"""
        update: dict[str, Any] = {"id": content_id}
        if payload.title:
            update["title"] = payload.title
        if payload.body_html:
            update["descriptionHtml"] = payload.body_html
        if payload.meta_title or payload.meta_description:
            update["seo"] = {
                "title": payload.meta_title,
                "description": payload.meta_description,
            }
        try:
            data = await self.graphql(mutation, {"input": update})
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        result = data.get("productUpdate", {})
        if result.get("userErrors"):
            return PublishResult(ok=False, error=str(result["userErrors"]))
        product = result.get("product", {})
        return PublishResult(
            ok=True, id=product.get("id"), url=product.get("onlineStoreUrl"),
            status=product.get("status", ""), raw=product,
        )


class WebflowConnector(CMSConnector):
    """Webflow CMS v2. Collection items only; static pages are designer-owned."""

    provider = "webflow"
    display_name = "Webflow"
    auth_kind = "token"
    content_types = ("collection_item",)
    docs_url = "https://developers.webflow.com/data/reference"
    capabilities = CMSConnector.capabilities + (
        Capability("publish_site", "Trigger a site publish", write=True),
    )
    BASE = "https://api.webflow.com/v2"

    def _headers(self) -> dict[str, str]:
        self.require("access_token")
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "accept-version": "2.0.0",
            "Content-Type": "application/json",
        }

    @property
    def site_id(self) -> str:
        value = self.config.get("site_id") or self.credentials.get("site_id")
        if not value:
            raise ConnectorError("Webflow site id is not configured")
        return value

    @property
    def collection_id(self) -> str:
        value = self.config.get("collection_id")
        if not value:
            raise ConnectorError(
                "Webflow collection id is not configured. Pick which collection "
                "blog content should be written to during onboarding."
            )
        return value

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request("GET", f"{self.BASE}/sites", headers=self._headers())
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(
            ok=True,
            data={
                "sites": [
                    {"id": s.get("id"), "name": s.get("displayName"),
                     "domains": [d.get("url") for d in s.get("customDomains", [])]}
                    for s in data.get("sites", [])
                ]
            },
        )

    async def list_collections(self) -> ConnectorResult:
        data = await self.request(
            "GET", f"{self.BASE}/sites/{self.site_id}/collections", headers=self._headers()
        )
        return ConnectorResult(ok=True, data=data.get("collections", []))

    async def list_content(self, *, content_type="collection_item", limit=50, search=None) -> ConnectorResult:
        data = await self.request(
            "GET",
            f"{self.BASE}/collections/{self.collection_id}/items",
            headers=self._headers(),
            params={"limit": min(limit, 100)},
        )
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=item.get("id"),
                    title=(item.get("fieldData") or {}).get("name", ""),
                    slug=(item.get("fieldData") or {}).get("slug"),
                    status="published" if not item.get("isDraft") else "draft",
                    type="collection_item",
                    modified_at=item.get("lastUpdated"),
                    raw=item,
                )
                for item in data.get("items", [])
            ],
        )

    async def get_content(self, content_id: str, *, content_type="collection_item") -> ConnectorResult:
        item = await self.request(
            "GET",
            f"{self.BASE}/collections/{self.collection_id}/items/{content_id}",
            headers=self._headers(),
        )
        field_data = item.get("fieldData") or {}
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=item.get("id"), title=field_data.get("name", ""),
                slug=field_data.get("slug"), type="collection_item",
                status="draft" if item.get("isDraft") else "published",
                modified_at=item.get("lastUpdated"), raw=item,
            ),
        )

    def _field_data(self, payload: ContentPayload) -> dict:
        # Webflow field slugs vary per collection, so the mapping is
        # configurable; these are the conventional defaults.
        mapping = self.config.get("field_map") or {}
        data = {
            mapping.get("name", "name"): payload.title,
            mapping.get("slug", "slug"): payload.slug,
        }
        if payload.body_html:
            data[mapping.get("body", "post-body")] = payload.body_html
        if payload.excerpt:
            data[mapping.get("excerpt", "post-summary")] = payload.excerpt
        if payload.meta_title:
            data[mapping.get("meta_title", "meta-title")] = payload.meta_title
        if payload.meta_description:
            data[mapping.get("meta_description", "meta-description")] = payload.meta_description
        if payload.featured_image_url:
            data[mapping.get("image", "main-image")] = {"url": payload.featured_image_url}
        return {k: v for k, v in data.items() if v is not None}

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        try:
            data = await self.request(
                "POST",
                f"{self.BASE}/collections/{self.collection_id}/items",
                headers=self._headers(),
                json={
                    "isArchived": False,
                    "isDraft": payload.status != "published",
                    "fieldData": self._field_data(payload),
                },
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(
            ok=True,
            id=data.get("id"),
            status="draft" if data.get("isDraft") else "published",
            warnings=self._warn_unsupported(payload, ["canonical_url", "schema_jsonld", "publish_at"]),
            raw=data,
        )

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        try:
            data = await self.request(
                "PATCH",
                f"{self.BASE}/collections/{self.collection_id}/items/{content_id}",
                headers=self._headers(),
                json={"fieldData": self._field_data(payload)},
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(ok=True, id=data.get("id"), raw=data)

    async def publish_site(self, domains: list[str] | None = None) -> ConnectorResult:
        """Webflow needs an explicit publish; a saved item is not a live item."""
        try:
            data = await self.request(
                "POST",
                f"{self.BASE}/sites/{self.site_id}/publish",
                headers=self._headers(),
                json={"publishToWebflowSubdomain": True, "customDomains": domains or []},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data=data)
