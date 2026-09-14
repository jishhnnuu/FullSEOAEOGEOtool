"""Headless CMS adapters: Ghost, Contentful, Sanity, Strapi."""

from __future__ import annotations

import time
from datetime import UTC
from typing import Any

import jwt
from seoos.connectors.base import Capability, ConnectorResult
from seoos.connectors.cms.base import CMSConnector, ContentPayload, PageRef, PublishResult
from seoos.core.errors import ConnectorError


class GhostConnector(CMSConnector):
    """Ghost Admin API. Auth is a short-lived JWT signed from the admin key."""

    provider = "ghost"
    display_name = "Ghost"
    auth_kind = "api_key"
    supports_scheduling = True
    content_types = ("post", "page")
    docs_url = "https://ghost.org/docs/admin-api/"

    @property
    def base(self) -> str:
        url = (self.config.get("site_url") or self.credentials.get("site_url") or "").rstrip("/")
        if not url:
            raise ConnectorError("Ghost site URL is not configured")
        return f"{url}/ghost/api/admin"

    def _token(self) -> str:
        self.require("admin_api_key")
        key_id, secret = self.credentials["admin_api_key"].split(":")
        now = int(time.time())
        return jwt.encode(
            {"iat": now, "exp": now + 300, "aud": "/admin/"},
            bytes.fromhex(secret),
            algorithm="HS256",
            headers={"kid": key_id, "alg": "HS256", "typ": "JWT"},
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Ghost {self._token()}",
            "Content-Type": "application/json",
            "Accept-Version": "v5.0",
        }

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request("GET", f"{self.base}/site/", headers=self._headers())
        except (ConnectorError, ValueError) as exc:
            return ConnectorResult.failure(str(exc))
        return ConnectorResult(ok=True, data=data.get("site", {}))

    async def list_content(self, *, content_type="post", limit=50, search=None) -> ConnectorResult:
        params = {"limit": min(limit, 100), "formats": "html"}
        if search:
            params["filter"] = f"title:~'{search}'"
        data = await self.request(
            "GET", f"{self.base}/{content_type}s/", headers=self._headers(), params=params
        )
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=item["id"], title=item.get("title", ""), url=item.get("url"),
                    slug=item.get("slug"), status=item.get("status", ""), type=content_type,
                    modified_at=item.get("updated_at"), excerpt=item.get("excerpt"), raw=item,
                )
                for item in data.get(f"{content_type}s", [])
            ],
        )

    async def get_content(self, content_id: str, *, content_type="post") -> ConnectorResult:
        data = await self.request(
            "GET", f"{self.base}/{content_type}s/{content_id}/",
            headers=self._headers(), params={"formats": "html,lexical"},
        )
        items = data.get(f"{content_type}s", [])
        if not items:
            return ConnectorResult.failure(f"Ghost {content_type} {content_id} not found")
        item = items[0]
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=item["id"], title=item.get("title", ""), url=item.get("url"),
                slug=item.get("slug"), status=item.get("status", ""), type=content_type,
                modified_at=item.get("updated_at"), raw=item,
            ),
        )

    def _body(self, payload: ContentPayload, *, updated_at: str | None = None) -> dict:
        entry: dict[str, Any] = {
            "title": payload.title,
            "status": {"published": "published", "scheduled": "scheduled"}.get(
                payload.status, "draft"
            ),
        }
        if payload.body_html:
            entry["html"] = payload.body_html
        if payload.slug:
            entry["slug"] = payload.slug
        if payload.excerpt:
            entry["custom_excerpt"] = payload.excerpt[:300]
        if payload.meta_title:
            entry["meta_title"] = payload.meta_title
        if payload.meta_description:
            entry["meta_description"] = payload.meta_description
        if payload.canonical_url:
            entry["canonical_url"] = payload.canonical_url
        if payload.featured_image_url:
            entry["feature_image"] = payload.featured_image_url
        if payload.tags:
            entry["tags"] = [{"name": t} for t in payload.tags]
        if payload.publish_at and payload.status == "scheduled":
            entry["published_at"] = payload.publish_at
        if payload.schema_jsonld:
            entry["codeinjection_head"] = (
                '<script type="application/ld+json">'
                + __import__("json").dumps(payload.schema_jsonld)
                + "</script>"
            )
        # Ghost requires the last-seen updated_at on edits as a concurrency
        # check, which is exactly the collision protection we want anyway.
        if updated_at:
            entry["updated_at"] = updated_at
        return entry

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        kind = payload.content_type if payload.content_type in ("post", "page") else "post"
        try:
            data = await self.request(
                "POST", f"{self.base}/{kind}s/",
                headers=self._headers(),
                params={"source": "html"},
                json={f"{kind}s": [self._body(payload)]},
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        item = data.get(f"{kind}s", [{}])[0]
        return PublishResult(
            ok=True, id=item.get("id"), url=item.get("url"),
            status=item.get("status", ""), raw=item,
        )

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        kind = payload.content_type if payload.content_type in ("post", "page") else "post"
        current = await self.get_content(content_id, content_type=kind)
        if not current.ok:
            return PublishResult(ok=False, error=current.error)
        updated_at = current.data.raw.get("updated_at")
        try:
            data = await self.request(
                "PUT", f"{self.base}/{kind}s/{content_id}/",
                headers=self._headers(),
                params={"source": "html"},
                json={f"{kind}s": [self._body(payload, updated_at=updated_at)]},
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        item = data.get(f"{kind}s", [{}])[0]
        return PublishResult(
            ok=True, id=item.get("id"), url=item.get("url"),
            status=item.get("status", ""), raw=item,
        )


class ContentfulConnector(CMSConnector):
    provider = "contentful"
    display_name = "Contentful"
    auth_kind = "token"
    content_types = ("entry",)
    docs_url = "https://www.contentful.com/developers/docs/references/content-management-api/"
    capabilities = CMSConnector.capabilities + (
        Capability("publish_entry", "Publish a drafted entry", write=True),
    )
    BASE = "https://api.contentful.com"

    def _headers(self) -> dict[str, str]:
        self.require("management_token")
        return {
            "Authorization": f"Bearer {self.credentials['management_token']}",
            "Content-Type": "application/vnd.contentful.management.v1+json",
        }

    @property
    def space(self) -> str:
        value = self.config.get("space_id") or self.credentials.get("space_id")
        if not value:
            raise ConnectorError("Contentful space id is not configured")
        return value

    @property
    def environment(self) -> str:
        return self.config.get("environment", "master")

    @property
    def content_type_id(self) -> str:
        return self.config.get("content_type_id", "blogPost")

    @property
    def locale(self) -> str:
        return self.config.get("locale", "en-US")

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.BASE}/spaces/{self.space}", headers=self._headers()
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"space": data.get("name")})

    async def list_content(self, *, content_type="entry", limit=50, search=None) -> ConnectorResult:
        params: dict[str, Any] = {"limit": min(limit, 100), "content_type": self.content_type_id}
        if search:
            params["query"] = search
        data = await self.request(
            "GET",
            f"{self.BASE}/spaces/{self.space}/environments/{self.environment}/entries",
            headers=self._headers(), params=params,
        )
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=item["sys"]["id"],
                    title=_localised(item.get("fields", {}).get("title"), self.locale),
                    slug=_localised(item.get("fields", {}).get("slug"), self.locale),
                    status="published" if item["sys"].get("publishedVersion") else "draft",
                    type="entry",
                    modified_at=item["sys"].get("updatedAt"),
                    raw=item,
                )
                for item in data.get("items", [])
            ],
        )

    async def get_content(self, content_id: str, *, content_type="entry") -> ConnectorResult:
        item = await self.request(
            "GET",
            f"{self.BASE}/spaces/{self.space}/environments/{self.environment}/entries/{content_id}",
            headers=self._headers(),
        )
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=item["sys"]["id"],
                title=_localised(item.get("fields", {}).get("title"), self.locale),
                slug=_localised(item.get("fields", {}).get("slug"), self.locale),
                status="published" if item["sys"].get("publishedVersion") else "draft",
                type="entry", modified_at=item["sys"].get("updatedAt"), raw=item,
            ),
        )

    def _fields(self, payload: ContentPayload) -> dict:
        mapping = self.config.get("field_map") or {}
        out = {
            mapping.get("title", "title"): {self.locale: payload.title},
            mapping.get("slug", "slug"): {self.locale: payload.slug},
        }
        if payload.body_html:
            out[mapping.get("body", "body")] = {self.locale: payload.body_html}
        if payload.meta_description:
            out[mapping.get("meta_description", "metaDescription")] = {
                self.locale: payload.meta_description
            }
        return {k: v for k, v in out.items() if v.get(self.locale) is not None}

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        try:
            data = await self.request(
                "POST",
                f"{self.BASE}/spaces/{self.space}/environments/{self.environment}/entries",
                headers={**self._headers(), "X-Contentful-Content-Type": self.content_type_id},
                json={"fields": self._fields(payload)},
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        entry_id = data["sys"]["id"]
        if payload.status == "published":
            await self._publish(entry_id, data["sys"]["version"])
        return PublishResult(ok=True, id=entry_id, status=payload.status, raw=data)

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        current = await self.get_content(content_id)
        if not current.ok:
            return PublishResult(ok=False, error=current.error)
        version = current.data.raw["sys"]["version"]
        merged = {**(current.data.raw.get("fields") or {}), **self._fields(payload)}
        try:
            data = await self.request(
                "PUT",
                f"{self.BASE}/spaces/{self.space}/environments/{self.environment}/entries/{content_id}",
                headers={**self._headers(), "X-Contentful-Version": str(version)},
                json={"fields": merged},
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        if payload.status == "published":
            await self._publish(content_id, data["sys"]["version"])
        return PublishResult(ok=True, id=content_id, status=payload.status, raw=data)

    async def _publish(self, entry_id: str, version: int) -> None:
        await self.request(
            "PUT",
            f"{self.BASE}/spaces/{self.space}/environments/{self.environment}/entries/{entry_id}/published",
            headers={**self._headers(), "X-Contentful-Version": str(version)},
        )


class SanityConnector(CMSConnector):
    provider = "sanity"
    display_name = "Sanity"
    auth_kind = "token"
    content_types = ("document",)
    docs_url = "https://www.sanity.io/docs/http-api"

    @property
    def project(self) -> str:
        value = self.config.get("project_id") or self.credentials.get("project_id")
        if not value:
            raise ConnectorError("Sanity project id is not configured")
        return value

    @property
    def dataset(self) -> str:
        return self.config.get("dataset", "production")

    @property
    def doc_type(self) -> str:
        return self.config.get("document_type", "post")

    def _headers(self) -> dict[str, str]:
        self.require("token")
        return {
            "Authorization": f"Bearer {self.credentials['token']}",
            "Content-Type": "application/json",
        }

    @property
    def base(self) -> str:
        return f"https://{self.project}.api.sanity.io/v2024-01-01"

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.base}/data/query/{self.dataset}",
                headers=self._headers(), params={"query": "count(*)"},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"documents": data.get("result")})

    async def list_content(self, *, content_type="document", limit=50, search=None) -> ConnectorResult:
        groq = f'*[_type == "{self.doc_type}"][0...{min(limit, 100)}]{{_id, title, slug, _updatedAt}}'
        data = await self.request(
            "GET", f"{self.base}/data/query/{self.dataset}",
            headers=self._headers(), params={"query": groq},
        )
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=doc["_id"], title=doc.get("title", ""),
                    slug=(doc.get("slug") or {}).get("current"),
                    type="document", modified_at=doc.get("_updatedAt"), raw=doc,
                )
                for doc in data.get("result", [])
            ],
        )

    async def get_content(self, content_id: str, *, content_type="document") -> ConnectorResult:
        data = await self.request(
            "GET", f"{self.base}/data/doc/{self.dataset}/{content_id}", headers=self._headers()
        )
        docs = data.get("documents", [])
        if not docs:
            return ConnectorResult.failure(f"Sanity document {content_id} not found")
        doc = docs[0]
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=doc["_id"], title=doc.get("title", ""),
                slug=(doc.get("slug") or {}).get("current"),
                type="document", modified_at=doc.get("_updatedAt"), raw=doc,
            ),
        )

    async def _mutate(self, mutations: list[dict]) -> dict:
        return await self.request(
            "POST", f"{self.base}/data/mutate/{self.dataset}",
            headers=self._headers(), json={"mutations": mutations},
            params={"returnIds": "true"},
        )

    def _document(self, payload: ContentPayload) -> dict:
        doc = {
            "_type": self.doc_type,
            "title": payload.title,
            "slug": {"_type": "slug", "current": payload.slug},
        }
        if payload.body_html:
            # Sanity stores Portable Text; HTML goes to a raw field the
            # client's own serializer renders, which the onboarding step names.
            doc[self.config.get("body_field", "bodyHtml")] = payload.body_html
        if payload.meta_description:
            doc["metaDescription"] = payload.meta_description
        return doc

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        try:
            data = await self._mutate([{"create": self._document(payload)}])
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        ids = [r.get("id") for r in data.get("results", [])]
        return PublishResult(ok=True, id=ids[0] if ids else None, status=payload.status, raw=data)

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        patch = {k: v for k, v in self._document(payload).items() if k != "_type"}
        try:
            data = await self._mutate([{"patch": {"id": content_id, "set": patch}}])
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(ok=True, id=content_id, raw=data)


class StrapiConnector(CMSConnector):
    provider = "strapi"
    display_name = "Strapi"
    auth_kind = "token"
    content_types = ("entry",)
    docs_url = "https://docs.strapi.io/dev-docs/api/rest"

    @property
    def base(self) -> str:
        url = (self.config.get("base_url") or self.credentials.get("base_url") or "").rstrip("/")
        if not url:
            raise ConnectorError("Strapi base URL is not configured")
        return f"{url}/api"

    @property
    def collection(self) -> str:
        return self.config.get("collection", "articles")

    def _headers(self) -> dict[str, str]:
        self.require("api_token")
        return {
            "Authorization": f"Bearer {self.credentials['api_token']}",
            "Content-Type": "application/json",
        }

    async def verify(self) -> ConnectorResult:
        try:
            await self.request(
                "GET", f"{self.base}/{self.collection}",
                headers=self._headers(), params={"pagination[pageSize]": 1},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"collection": self.collection})

    async def list_content(self, *, content_type="entry", limit=50, search=None) -> ConnectorResult:
        params: dict[str, Any] = {"pagination[pageSize]": min(limit, 100)}
        if search:
            params["filters[title][$containsi]"] = search
        data = await self.request(
            "GET", f"{self.base}/{self.collection}", headers=self._headers(), params=params
        )
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=str(item.get("id")),
                    title=(item.get("attributes") or item).get("title", ""),
                    slug=(item.get("attributes") or item).get("slug"),
                    status="published" if (item.get("attributes") or item).get("publishedAt") else "draft",
                    type="entry",
                    modified_at=(item.get("attributes") or item).get("updatedAt"),
                    raw=item,
                )
                for item in data.get("data", [])
            ],
        )

    async def get_content(self, content_id: str, *, content_type="entry") -> ConnectorResult:
        data = await self.request(
            "GET", f"{self.base}/{self.collection}/{content_id}", headers=self._headers()
        )
        item = data.get("data") or {}
        attrs = item.get("attributes") or item
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=str(item.get("id")), title=attrs.get("title", ""), slug=attrs.get("slug"),
                status="published" if attrs.get("publishedAt") else "draft",
                type="entry", modified_at=attrs.get("updatedAt"), raw=item,
            ),
        )

    def _payload(self, payload: ContentPayload) -> dict:
        data: dict[str, Any] = {"title": payload.title, "slug": payload.slug}
        if payload.body_html:
            data["content"] = payload.body_html
        if payload.meta_description:
            data["metaDescription"] = payload.meta_description
        if payload.status == "published":
            from datetime import datetime

            data["publishedAt"] = datetime.now(UTC).isoformat()
        return {"data": {k: v for k, v in data.items() if v is not None}}

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        try:
            data = await self.request(
                "POST", f"{self.base}/{self.collection}",
                headers=self._headers(), json=self._payload(payload),
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        item = data.get("data") or {}
        return PublishResult(ok=True, id=str(item.get("id")), status=payload.status, raw=data)

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        try:
            data = await self.request(
                "PUT", f"{self.base}/{self.collection}/{content_id}",
                headers=self._headers(), json=self._payload(payload),
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(ok=True, id=content_id, raw=data)


def _localised(field: Any, locale: str) -> str:
    if isinstance(field, dict):
        return field.get(locale) or next(iter(field.values()), "")
    return field or ""
