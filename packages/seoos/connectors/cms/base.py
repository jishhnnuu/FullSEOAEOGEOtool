"""The CMS contract.

Five operations cover every platform worth supporting:

    list_content   what exists, so we can find the page to update
    get_content    the current state, so an update is a diff not a replacement
    create_content publish something new
    update_content change something live
    upload_media   put an image somewhere the page can reference it

Two rules every adapter follows. First, an update always reads before it
writes, because overwriting a client's hand-edited copy with a stale draft is
unforgivable. Second, publishing returns the live URL, because the platform
has to verify what it published.
"""

from __future__ import annotations

from abc import abstractmethod
from dataclasses import dataclass, field
from typing import Any

from seoos.connectors.base import Capability, Connector, ConnectorResult


@dataclass
class PageRef:
    """A piece of content as the CMS sees it."""

    id: str
    title: str
    url: str | None = None
    slug: str | None = None
    status: str = "unknown"
    type: str = "post"
    modified_at: str | None = None
    excerpt: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class PublishResult:
    ok: bool
    id: str | None = None
    url: str | None = None
    status: str = "unknown"
    error: str | None = None
    warnings: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ContentPayload:
    """What the publisher hands to any adapter."""

    title: str
    body_html: str
    slug: str | None = None
    excerpt: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    status: str = "draft"  # draft | published | scheduled
    content_type: str = "post"
    categories: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    featured_image_url: str | None = None
    canonical_url: str | None = None
    schema_jsonld: dict | None = None
    author: str | None = None
    publish_at: str | None = None
    custom_fields: dict[str, Any] = field(default_factory=dict)


class CMSConnector(Connector):
    """Base for anything the platform can publish through."""

    supports_scheduling: bool = False
    supports_custom_meta: bool = True
    supports_media_upload: bool = True
    content_types: tuple[str, ...] = ("post", "page")

    capabilities = (
        Capability("list_content", "Enumerate existing pages and posts"),
        Capability("create_content", "Publish new content", write=True),
        Capability("update_content", "Edit existing content", write=True),
    )

    @abstractmethod
    async def list_content(
        self, *, content_type: str = "post", limit: int = 50, search: str | None = None
    ) -> ConnectorResult:
        """Return a list of :class:`PageRef`."""

    @abstractmethod
    async def get_content(self, content_id: str, *, content_type: str = "post") -> ConnectorResult:
        """Return the full current state of one item."""

    @abstractmethod
    async def create_content(self, payload: ContentPayload) -> PublishResult:
        ...

    @abstractmethod
    async def update_content(self, content_id: str, payload: ContentPayload) -> PublishResult:
        ...

    async def upload_media(
        self, *, filename: str, content: bytes, mime_type: str, alt_text: str | None = None
    ) -> ConnectorResult:
        return ConnectorResult.failure(
            f"{self.display_name} media upload is not implemented; "
            "reference an externally hosted image instead"
        )

    async def update_metadata(
        self, content_id: str, *, meta_title: str | None = None, meta_description: str | None = None
    ) -> PublishResult:
        """Change only the SEO fields.

        Separate from a full update because it is by far the most common
        autonomous change the platform makes, and touching only two fields is
        much safer than round-tripping an entire post body.
        """
        current = await self.get_content(content_id)
        if not current.ok:
            return PublishResult(ok=False, error=current.error)
        page: PageRef = current.data
        payload = ContentPayload(
            title=page.title,
            body_html="",
            slug=page.slug,
            meta_title=meta_title,
            meta_description=meta_description,
            status=page.status,
        )
        return await self.update_content(content_id, payload)

    @staticmethod
    def _warn_unsupported(payload: ContentPayload, unsupported: list[str]) -> list[str]:
        """Say plainly what a platform silently dropped.

        Webflow ignoring a canonical URL, or Shopify ignoring a schedule, has
        to reach the client as a warning rather than be assumed applied.
        """
        warnings = []
        for field_name in unsupported:
            if getattr(payload, field_name, None):
                warnings.append(f"{field_name} is not supported by this CMS and was not applied")
        return warnings
