"""The escape hatches: static sites via GitHub, and anything else via HTTP.

These two matter more than they look. Between them they cover every site the
named adapters miss, so "we cannot publish to your stack" is never the answer.

The GitHub adapter is also the safest publishing path in the whole platform:
changes arrive as a pull request against the client's repository, so their
existing review and CI gates apply and nothing reaches production that their
own pipeline would have rejected.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from typing import Any

from seoos.connectors.base import Capability, ConnectorResult
from seoos.connectors.cms.base import CMSConnector, ContentPayload, PageRef, PublishResult
from seoos.core.errors import ConnectorError
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.cms.generic")


class GitHubStaticConnector(CMSConnector):
    """Publish to a static site (Next.js, Astro, Hugo, Jekyll, Eleventy) by
    opening a pull request."""

    provider = "github"
    display_name = "GitHub (static site)"
    auth_kind = "token"
    supports_scheduling = False
    content_types = ("markdown", "mdx")
    docs_url = "https://docs.github.com/en/rest"
    capabilities = CMSConnector.capabilities + (
        Capability("pull_request", "Open a reviewable pull request", write=True),
        Capability("direct_commit", "Commit straight to a branch", write=True),
    )
    BASE = "https://api.github.com"

    def _headers(self) -> dict[str, str]:
        self.require("token")
        return {
            "Authorization": f"Bearer {self.credentials['token']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @property
    def repo(self) -> str:
        value = self.config.get("repo") or self.credentials.get("repo")
        if not value or "/" not in value:
            raise ConnectorError("GitHub repo must be configured as 'owner/name'")
        return value

    @property
    def base_branch(self) -> str:
        return self.config.get("base_branch", "main")

    @property
    def content_dir(self) -> str:
        return self.config.get("content_dir", "content/blog").strip("/")

    @property
    def file_extension(self) -> str:
        return self.config.get("extension", "md").lstrip(".")

    @property
    def open_pull_request(self) -> bool:
        # Defaulting to a pull request rather than a direct commit is a
        # deliberate safety choice: the client's CI is the last gate.
        return bool(self.config.get("open_pull_request", True))

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.BASE}/repos/{self.repo}", headers=self._headers()
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        permissions = data.get("permissions") or {}
        can_push = bool(permissions.get("push"))
        return ConnectorResult(
            ok=True,
            data={
                "repo": data.get("full_name"),
                "default_branch": data.get("default_branch"),
                "can_push": can_push,
                "private": data.get("private"),
            },
            degraded=not can_push,
            meta={} if can_push else {"note": "The token cannot push; publishing will fail."},
        )

    async def list_content(self, *, content_type="markdown", limit=50, search=None) -> ConnectorResult:
        try:
            entries = await self.request(
                "GET",
                f"{self.BASE}/repos/{self.repo}/contents/{self.content_dir}",
                headers=self._headers(),
                params={"ref": self.base_branch},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        if not isinstance(entries, list):
            return ConnectorResult(ok=True, data=[])
        files = [
            entry for entry in entries
            if entry.get("type") == "file"
            and entry.get("name", "").endswith((".md", ".mdx"))
            and (not search or search.lower() in entry.get("name", "").lower())
        ]
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=entry["path"],
                    title=entry["name"].rsplit(".", 1)[0].replace("-", " ").title(),
                    slug=entry["name"].rsplit(".", 1)[0],
                    status="published",
                    type="markdown",
                    raw=entry,
                )
                for entry in files[:limit]
            ],
        )

    async def get_content(self, content_id: str, *, content_type="markdown") -> ConnectorResult:
        try:
            entry = await self.request(
                "GET",
                f"{self.BASE}/repos/{self.repo}/contents/{content_id}",
                headers=self._headers(),
                params={"ref": self.base_branch},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        body = base64.b64decode(entry.get("content", "")).decode("utf-8", errors="replace")
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=entry["path"],
                title=entry["name"].rsplit(".", 1)[0],
                slug=entry["name"].rsplit(".", 1)[0],
                status="published",
                type="markdown",
                raw={**entry, "body": body, "sha": entry.get("sha")},
            ),
        )

    def _front_matter(self, payload: ContentPayload) -> str:
        """YAML front matter, quoted safely.

        Hand-rolled rather than pulled from a YAML dumper so the output stays
        stable and diff-friendly across runs; a reordered key set makes every
        pull request look like a rewrite.
        """
        fields: list[tuple[str, Any]] = [
            ("title", payload.title),
            ("description", payload.meta_description),
            ("slug", payload.slug),
            ("date", payload.publish_at or datetime.now(UTC).strftime("%Y-%m-%d")),
            ("draft", payload.status != "published"),
        ]
        if payload.meta_title and payload.meta_title != payload.title:
            fields.append(("seoTitle", payload.meta_title))
        if payload.canonical_url:
            fields.append(("canonical", payload.canonical_url))
        if payload.author:
            fields.append(("author", payload.author))
        if payload.featured_image_url:
            fields.append(("image", payload.featured_image_url))

        lines = ["---"]
        for key, value in fields:
            if value is None or value == "":
                continue
            if isinstance(value, bool):
                lines.append(f"{key}: {'true' if value else 'false'}")
            else:
                lines.append(f'{key}: {_yaml_quote(str(value))}')
        if payload.tags:
            lines.append("tags:")
            lines.extend(f"  - {_yaml_quote(t)}" for t in payload.tags)
        if payload.categories:
            lines.append("categories:")
            lines.extend(f"  - {_yaml_quote(c)}" for c in payload.categories)
        for key, value in (payload.custom_fields or {}).items():
            if isinstance(value, (str, int, float, bool)):
                lines.append(f"{key}: {_yaml_quote(str(value))}")
        lines.append("---")
        return "\n".join(lines)

    def _file_body(self, payload: ContentPayload) -> str:
        body = payload.custom_fields.get("body_markdown") or payload.body_html
        parts = [self._front_matter(payload), "", body or ""]
        if payload.schema_jsonld:
            parts += [
                "",
                '<script type="application/ld+json">',
                json.dumps(payload.schema_jsonld, indent=2),
                "</script>",
            ]
        return "\n".join(parts).rstrip() + "\n"

    def _path_for(self, payload: ContentPayload) -> str:
        slug = payload.slug or "untitled"
        return f"{self.content_dir}/{slug}.{self.file_extension}"

    async def _branch_head(self, branch: str) -> str:
        ref = await self.request(
            "GET",
            f"{self.BASE}/repos/{self.repo}/git/ref/heads/{branch}",
            headers=self._headers(),
        )
        return ref["object"]["sha"]

    async def _ensure_branch(self, name: str) -> None:
        try:
            await self.request(
                "GET",
                f"{self.BASE}/repos/{self.repo}/git/ref/heads/{name}",
                headers=self._headers(),
            )
            return
        except ConnectorError:
            pass
        head = await self._branch_head(self.base_branch)
        await self.request(
            "POST",
            f"{self.BASE}/repos/{self.repo}/git/refs",
            headers=self._headers(),
            json={"ref": f"refs/heads/{name}", "sha": head},
        )

    async def _commit_file(
        self, *, branch: str, path: str, content: str, message: str, sha: str | None = None
    ) -> dict:
        body: dict[str, Any] = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch,
        }
        if sha:
            body["sha"] = sha
        return await self.request(
            "PUT",
            f"{self.BASE}/repos/{self.repo}/contents/{path}",
            headers=self._headers(),
            json=body,
        )

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        path = self._path_for(payload)
        branch = (
            f"seo-os/{payload.slug or 'content'}-{datetime.now(UTC):%Y%m%d%H%M}"
            if self.open_pull_request
            else self.base_branch
        )
        try:
            if self.open_pull_request:
                await self._ensure_branch(branch)
            commit = await self._commit_file(
                branch=branch,
                path=path,
                content=self._file_body(payload),
                message=f"Add {payload.title}",
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)

        if not self.open_pull_request:
            return PublishResult(
                ok=True, id=path, status="committed",
                url=(commit.get("content") or {}).get("html_url"),
                raw=commit,
            )
        return await self._open_pr(branch, payload, path)

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        current = await self.get_content(content_id)
        if not current.ok:
            return PublishResult(ok=False, error=current.error)
        sha = current.data.raw.get("sha")
        branch = (
            f"seo-os/update-{(payload.slug or 'content')}-{datetime.now(UTC):%Y%m%d%H%M}"
            if self.open_pull_request
            else self.base_branch
        )
        try:
            if self.open_pull_request:
                await self._ensure_branch(branch)
                # The blob sha is branch-independent, so the base-branch sha
                # is the correct parent for the new branch's first commit.
            commit = await self._commit_file(
                branch=branch,
                path=content_id,
                content=self._file_body(payload),
                message=f"Update {payload.title}",
                sha=sha,
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)

        if not self.open_pull_request:
            return PublishResult(ok=True, id=content_id, status="committed", raw=commit)
        return await self._open_pr(branch, payload, content_id, verb="Update")

    async def _open_pr(
        self, branch: str, payload: ContentPayload, path: str, *, verb: str = "Add"
    ) -> PublishResult:
        body = (
            f"{verb}s `{path}`.\n\n"
            f"**Target keyword:** {payload.custom_fields.get('primary_keyword', 'not set')}\n"
            f"**Meta description:** {payload.meta_description or 'not set'}\n\n"
            "Opened automatically by SEO OS. Your existing review and CI checks "
            "apply as normal; nothing is live until this merges and deploys."
        )
        try:
            pr = await self.request(
                "POST",
                f"{self.BASE}/repos/{self.repo}/pulls",
                headers=self._headers(),
                json={
                    "title": f"{verb}: {payload.title}",
                    "head": branch,
                    "base": self.base_branch,
                    "body": body,
                },
            )
        except ConnectorError as exc:
            return PublishResult(
                ok=False,
                error=f"Committed to {branch} but could not open a pull request: {exc.message}",
            )
        return PublishResult(
            ok=True,
            id=path,
            url=pr.get("html_url"),
            status="pull_request_open",
            warnings=[
                "Content is in a pull request, not live. It goes live when the "
                "pull request is merged and the site redeploys."
            ],
            raw=pr,
        )


class CustomHTTPConnector(CMSConnector):
    """Any CMS with a documented write endpoint.

    Configured rather than coded: the client supplies the endpoints, the auth
    header and a field mapping. It is the difference between supporting nine
    platforms and supporting all of them.
    """

    provider = "custom_http"
    display_name = "Custom HTTP endpoint"
    auth_kind = "api_key"
    content_types = ("custom",)

    def _headers(self) -> dict[str, str]:
        headers = dict(self.config.get("headers") or {})
        scheme = self.config.get("auth_scheme", "Bearer")
        if self.credentials.get("api_key"):
            header_name = self.config.get("auth_header", "Authorization")
            headers[header_name] = (
                f"{scheme} {self.credentials['api_key']}" if scheme else self.credentials["api_key"]
            )
        headers.setdefault("Content-Type", "application/json")
        return headers

    def _endpoint(self, name: str) -> str:
        endpoints = self.config.get("endpoints") or {}
        url = endpoints.get(name)
        if not url:
            raise ConnectorError(
                f"No '{name}' endpoint configured for this custom CMS connection"
            )
        return url

    def _map_payload(self, payload: ContentPayload) -> dict:
        """Rename our fields to whatever the client's API expects."""
        mapping = self.config.get("field_map") or {}
        source = {
            "title": payload.title,
            "body": payload.body_html,
            "slug": payload.slug,
            "excerpt": payload.excerpt,
            "meta_title": payload.meta_title,
            "meta_description": payload.meta_description,
            "status": payload.status,
            "canonical_url": payload.canonical_url,
            "tags": payload.tags,
        }
        out: dict[str, Any] = {}
        for key, value in source.items():
            if value in (None, "", []):
                continue
            out[mapping.get(key, key)] = value
        out.update(self.config.get("static_fields") or {})
        return out

    async def verify(self) -> ConnectorResult:
        probe = (self.config.get("endpoints") or {}).get("verify") or (
            self.config.get("endpoints") or {}
        ).get("list")
        if not probe:
            return ConnectorResult.failure(
                "Configure a 'verify' or 'list' endpoint so the connection can be tested"
            )
        try:
            await self.request("GET", probe, headers=self._headers())
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"endpoint": probe})

    async def list_content(self, *, content_type="custom", limit=50, search=None) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", self._endpoint("list"), headers=self._headers(),
                params={"limit": limit, **({"q": search} if search else {})},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        items = data if isinstance(data, list) else data.get(self.config.get("list_key", "items"), [])
        mapping = self.config.get("response_map") or {}
        return ConnectorResult(
            ok=True,
            data=[
                PageRef(
                    id=str(item.get(mapping.get("id", "id"))),
                    title=item.get(mapping.get("title", "title"), ""),
                    url=item.get(mapping.get("url", "url")),
                    slug=item.get(mapping.get("slug", "slug")),
                    status=item.get(mapping.get("status", "status"), "unknown"),
                    type="custom",
                    raw=item,
                )
                for item in items
            ],
        )

    async def get_content(self, content_id: str, *, content_type="custom") -> ConnectorResult:
        try:
            item = await self.request(
                "GET", f"{self._endpoint('get').rstrip('/')}/{content_id}",
                headers=self._headers(),
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        mapping = self.config.get("response_map") or {}
        return ConnectorResult(
            ok=True,
            data=PageRef(
                id=str(item.get(mapping.get("id", "id"), content_id)),
                title=item.get(mapping.get("title", "title"), ""),
                url=item.get(mapping.get("url", "url")),
                slug=item.get(mapping.get("slug", "slug")),
                status=item.get(mapping.get("status", "status"), "unknown"),
                type="custom", raw=item,
            ),
        )

    async def create_content(self, payload: ContentPayload) -> PublishResult:
        try:
            data = await self.request(
                "POST", self._endpoint("create"),
                headers=self._headers(), json=self._map_payload(payload),
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        mapping = self.config.get("response_map") or {}
        return PublishResult(
            ok=True,
            id=str(data.get(mapping.get("id", "id"), "")),
            url=data.get(mapping.get("url", "url")),
            status=payload.status,
            raw=data if isinstance(data, dict) else {},
        )

    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        method = self.config.get("update_method", "PUT").upper()
        try:
            data = await self.request(
                method, f"{self._endpoint('update').rstrip('/')}/{content_id}",
                headers=self._headers(), json=self._map_payload(payload),
            )
        except ConnectorError as exc:
            return PublishResult(ok=False, error=exc.message)
        return PublishResult(
            ok=True, id=content_id, status=payload.status,
            raw=data if isinstance(data, dict) else {},
        )


def _yaml_quote(value: str) -> str:
    """Quote a YAML scalar safely without pulling in a dumper."""
    if not value:
        return '""'
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    return f'"{escaped}"'
