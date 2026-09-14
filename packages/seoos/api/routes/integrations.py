"""Connecting the accounts the platform works through."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from seoos.api.schemas import ConnectRequest, IntegrationOut
from seoos.api.security import Session, Tenant, require
from seoos.connectors.registry import (
    SPECS_BY_PROVIDER,
    build_connector,
    catalogue,
)
from seoos.core.db import TenantContext
from seoos.core.errors import NotFound
from seoos.core.models import Integration
from seoos.services.audit_log import record_event
from seoos.services.credentials import CredentialService

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/catalogue")
async def get_catalogue(tenant: Tenant, category: str | None = None) -> dict:
    """What can be connected, what each unlocks, and what it needs.

    The onboarding UI is generated from this, so a new connector appears in
    the product without a front-end change.
    """
    entries = catalogue(category)
    by_category: dict[str, list] = {}
    for entry in entries:
        by_category.setdefault(entry["category"], []).append(entry)
    return {"providers": entries, "by_category": by_category}


@router.get("", response_model=list[IntegrationOut])
async def list_integrations(
    tenant: Tenant, session: Session, site_id: str | None = None
) -> list[Integration]:
    rows = await CredentialService(session).list_integrations(
        org_id=tenant.org_id, site_id=site_id
    )
    return rows


@router.post("/connect")
async def connect(
    payload: ConnectRequest, session: Session, tenant: TenantContext = require("admin")
) -> dict:
    """Store a credential and prove it works with a real call.

    Verifying immediately matters: a stored key that does not work produces
    silently empty reports for weeks, and the client blames the platform.
    """
    if payload.provider not in SPECS_BY_PROVIDER and payload.provider not in (
        "anthropic", "openai", "google", "openrouter", "azure", "ollama",
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unknown provider {payload.provider!r}"
        )

    service = CredentialService(session)
    credential = await service.store(
        org_id=tenant.org_id,
        provider=payload.provider,
        payload=payload.credentials,
        site_id=payload.site_id,
        kind=SPECS_BY_PROVIDER.get(payload.provider).auth_kind
        if payload.provider in SPECS_BY_PROVIDER else "api_key",
    )

    verification = {"ok": True, "skipped": True}
    if payload.provider in SPECS_BY_PROVIDER:
        try:
            connector = build_connector(
                payload.provider, payload.credentials, config=payload.config
            )
            async with connector:
                result = await connector.verify()
            verification = {
                "ok": result.ok,
                "degraded": result.degraded,
                "data": result.data,
                "error": result.error,
                "note": (result.meta or {}).get("note"),
            }
        except NotFound as exc:
            verification = {"ok": False, "error": exc.message}
        except Exception as exc:  # noqa: BLE001
            verification = {"ok": False, "error": str(exc)}

    integration = await service.upsert_integration(
        org_id=tenant.org_id,
        provider=payload.provider,
        site_id=payload.site_id,
        display_name=SPECS_BY_PROVIDER.get(payload.provider).display_name
        if payload.provider in SPECS_BY_PROVIDER else payload.provider,
        status="connected" if verification.get("ok") else "error",
        config=payload.config,
        credential_id=credential.id,
        capabilities=[
            c.key for c in getattr(
                build_connector(payload.provider, {}, config={}), "capabilities", ()
            )
        ] if payload.provider in SPECS_BY_PROVIDER else [],
    )
    if not verification.get("ok"):
        integration.last_error = str(verification.get("error"))[:2000]

    await record_event(
        session, org_id=tenant.org_id, site_id=payload.site_id,
        action="integration.connected" if verification.get("ok") else "integration.failed",
        object_type="integration", object_id=integration.id,
        actor_type="user", actor_id=tenant.user_id,
        summary=f"{payload.provider}: {'connected' if verification.get('ok') else 'verification failed'}",
    )
    await session.flush()

    return {
        "integration_id": integration.id,
        "provider": payload.provider,
        "status": integration.status,
        "verification": verification,
    }


@router.post("/{integration_id}/verify")
async def verify(integration_id: str, session: Session, tenant: TenantContext = require("admin")) -> dict:
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.id == integration_id, Integration.org_id == tenant.org_id
            )
        )
    ).scalar_one_or_none()
    if integration is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not found")

    service = CredentialService(session)
    credentials = await service.try_load(
        org_id=tenant.org_id, provider=integration.provider, site_id=integration.site_id
    )
    if credentials is None:
        integration.status = "expired"
        return {"ok": False, "error": "The stored credential is gone; reconnect this account"}

    connector = build_connector(integration.provider, credentials, config=integration.config)
    async with connector:
        result = await connector.verify()
    if result.ok:
        await service.upsert_integration(
            org_id=tenant.org_id, provider=integration.provider,
            site_id=integration.site_id, account_ref=integration.account_ref,
            status="degraded" if result.degraded else "connected",
        )
    else:
        await service.mark_error(integration.id, result.error or "verification failed")
    return {"ok": result.ok, "degraded": result.degraded, "data": result.data, "error": result.error}


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    integration_id: str, session: Session, tenant: TenantContext = require("admin")
) -> None:
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.id == integration_id, Integration.org_id == tenant.org_id
            )
        )
    ).scalar_one_or_none()
    if integration is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not found")
    service = CredentialService(session)
    if integration.credential_id:
        await service.revoke(integration.credential_id)
    integration.status = "revoked"
    await record_event(
        session, org_id=tenant.org_id, site_id=integration.site_id,
        action="integration.disconnected", object_type="integration",
        object_id=integration.id, actor_type="user", actor_id=tenant.user_id,
        summary=f"Disconnected {integration.provider}", severity=1,
    )
    await session.flush()
