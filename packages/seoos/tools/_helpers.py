"""Shared plumbing for tool implementations.

Tools are the widest surface in the codebase, so anything repeated across
them belongs here: fetching the right connector for a site, loading the
brand brain, and the small JSON-schema builders that keep tool declarations
readable.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from seoos.connectors.registry import build_connector
from seoos.core.errors import CredentialMissing
from seoos.services.credentials import CredentialService
from seoos.tools.registry import ToolContext

# -- schema builders ---------------------------------------------------------

def schema(**properties) -> dict:
    """Build a JSON Schema object. Keys ending in ``_`` are optional.

    Written this way because tool declarations are read far more often than
    they are written, and a wall of nested dicts is unreadable.
    """
    props, required = {}, []
    for name, spec in properties.items():
        key = name.rstrip("_")
        props[key] = spec
        if not name.endswith("_"):
            required.append(key)
    return {"type": "object", "properties": props, "required": required}


def string(description: str, *, enum: list[str] | None = None, default: Any = None) -> dict:
    out: dict[str, Any] = {"type": "string", "description": description}
    if enum:
        out["enum"] = enum
    if default is not None:
        out["default"] = default
    return out


def integer(description: str, *, minimum: int | None = None, maximum: int | None = None,
            default: int | None = None) -> dict:
    out: dict[str, Any] = {"type": "integer", "description": description}
    if minimum is not None:
        out["minimum"] = minimum
    if maximum is not None:
        out["maximum"] = maximum
    if default is not None:
        out["default"] = default
    return out


def number(description: str, **kw) -> dict:
    return {"type": "number", "description": description, **kw}


def boolean(description: str, *, default: bool | None = None) -> dict:
    out: dict[str, Any] = {"type": "boolean", "description": description}
    if default is not None:
        out["default"] = default
    return out


def array(description: str, items: dict, *, max_items: int | None = None) -> dict:
    out: dict[str, Any] = {"type": "array", "description": description, "items": items}
    if max_items:
        out["maxItems"] = max_items
    return out


def obj(description: str, **properties) -> dict:
    return {
        "type": "object",
        "description": description,
        "properties": {k.rstrip("_"): v for k, v in properties.items()},
    }


# -- context helpers ---------------------------------------------------------

async def connector_for(ctx: ToolContext, provider: str, *, config: dict | None = None):
    """Build a live connector for this site, or raise a clear CredentialMissing.

    The raise is deliberate: the resolver turns a typed CredentialMissing into
    a route around the provider, whereas a None return turns into an
    AttributeError three frames later.
    """
    service = CredentialService(ctx.session)
    credentials = await service.try_load(
        org_id=ctx.org_id, provider=provider, site_id=ctx.site_id
    )
    if credentials is None:
        raise CredentialMissing(
            f"{provider} is not connected for this site",
            context={"provider": provider, "site_id": ctx.site_id},
        )

    merged = dict(config or {})
    integration = await _integration_config(ctx, provider)
    merged = {**integration, **merged}
    if ctx.site is not None:
        merged.setdefault("site_url", ctx.site.base_url)
        merged.setdefault("host", ctx.site.domain)
    return build_connector(provider, credentials, config=merged, router=ctx.router)


async def _integration_config(ctx: ToolContext, provider: str) -> dict:
    from seoos.core.models import Integration

    stmt = select(Integration).where(
        Integration.org_id == ctx.org_id, Integration.provider == provider
    )
    if ctx.site_id:
        stmt = stmt.where(
            (Integration.site_id == ctx.site_id) | (Integration.site_id.is_(None))
        )
    row = (await ctx.session.execute(stmt)).scalars().first()
    if row is None:
        return {}
    config = dict(row.config or {})
    if row.account_ref:
        config.setdefault("site_url", row.account_ref)
        config.setdefault("property_id", row.account_ref)
    return config


async def has_connector(ctx: ToolContext, provider: str) -> bool:
    service = CredentialService(ctx.session)
    return await service.try_load(
        org_id=ctx.org_id, provider=provider, site_id=ctx.site_id
    ) is not None


async def connected_providers(ctx: ToolContext) -> set[str]:
    return await CredentialService(ctx.session).connected_providers(
        org_id=ctx.org_id, site_id=ctx.site_id
    )


async def load_site(ctx: ToolContext):
    """Ensure ``ctx.site`` is populated, loading it once per run."""
    if ctx.site is not None:
        return ctx.site
    if not ctx.site_id:
        return None
    from seoos.core.models import Site

    ctx.site = (
        await ctx.session.execute(select(Site).where(Site.id == ctx.site_id))
    ).scalar_one_or_none()
    return ctx.site


def trim(items: list, limit: int = 50) -> list:
    """Cap a list before it goes into a prompt."""
    return items[:limit]


def compact(rows: list[dict], keys: list[str]) -> list[dict]:
    """Project rows down to the fields a model needs.

    Handing a model a full API response wastes context on fields it will never
    use and makes it likelier to quote an irrelevant one.
    """
    return [{k: row.get(k) for k in keys if k in row} for row in rows]
