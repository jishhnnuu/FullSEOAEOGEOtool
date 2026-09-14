"""CMS adapters: how published content actually reaches the client's site.

This is the capability that separates a tool from an agency. Everything else
in the platform produces recommendations; this layer makes them real. Each
adapter implements the same small contract so the publisher agent never needs
to know which CMS it is talking to.
"""

from seoos.connectors.cms.base import CMSConnector, PageRef, PublishResult
from seoos.connectors.cms.generic import CustomHTTPConnector, GitHubStaticConnector
from seoos.connectors.cms.headless import (
    ContentfulConnector,
    GhostConnector,
    SanityConnector,
    StrapiConnector,
)
from seoos.connectors.cms.hosted import (
    ShopifyConnector,
    WebflowConnector,
    WordPressConnector,
)

CMS_CONNECTORS = {
    "wordpress": WordPressConnector,
    "shopify": ShopifyConnector,
    "webflow": WebflowConnector,
    "ghost": GhostConnector,
    "contentful": ContentfulConnector,
    "sanity": SanityConnector,
    "strapi": StrapiConnector,
    "github": GitHubStaticConnector,
    "custom_http": CustomHTTPConnector,
}

__all__ = [
    "CMSConnector", "PublishResult", "PageRef", "CMS_CONNECTORS",
    "WordPressConnector", "ShopifyConnector", "WebflowConnector",
    "GhostConnector", "ContentfulConnector", "SanityConnector",
    "StrapiConnector", "GitHubStaticConnector", "CustomHTTPConnector",
]
