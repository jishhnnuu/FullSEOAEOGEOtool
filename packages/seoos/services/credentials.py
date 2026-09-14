"""Credentials and integration health.

Every secret is sealed on the way in and only ever unsealed at the point of
use. Nothing in the API layer returns a secret, in any shape, at any time:
the dashboard sees status, scopes and a fingerprint.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from seoos.core.crypto import seal, unseal_json
from seoos.core.errors import CredentialMissing
from seoos.core.logging import get_logger
from seoos.core.models import Credential, Integration

log = get_logger("seoos.services.credentials")


class CredentialService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def store(
        self,
        *,
        org_id: str,
        provider: str,
        payload: dict[str, Any],
        site_id: str | None = None,
        kind: str = "api_key",
        expires_at: datetime | None = None,
        refreshable: bool = False,
    ) -> Credential:
        """Replace any existing credential for this scope, keeping one live row."""
        existing = await self._find(org_id, provider, site_id)
        fingerprint = hashlib.blake2b(
            repr(sorted(payload.items())).encode(), digest_size=8
        ).hexdigest()

        if existing is not None:
            existing.sealed = seal(payload)
            existing.kind = kind
            existing.expires_at = expires_at
            existing.refreshable = refreshable
            existing.rotated_at = datetime.now(UTC)
            existing.fingerprint = fingerprint
            existing.revoked_at = None
            await self.session.flush()
            return existing

        credential = Credential(
            org_id=org_id,
            site_id=site_id,
            provider=provider,
            kind=kind,
            sealed=seal(payload),
            expires_at=expires_at,
            refreshable=refreshable,
            fingerprint=fingerprint,
        )
        self.session.add(credential)
        await self.session.flush()
        return credential

    async def load(
        self, *, org_id: str, provider: str, site_id: str | None = None
    ) -> dict[str, Any]:
        credential = await self._find(org_id, provider, site_id)
        if credential is None or credential.revoked_at is not None:
            raise CredentialMissing(
                f"No {provider} credential is connected for this site",
                context={"provider": provider, "site_id": site_id},
            )
        return unseal_json(credential.sealed)

    async def try_load(
        self, *, org_id: str, provider: str, site_id: str | None = None
    ) -> dict[str, Any] | None:
        try:
            return await self.load(org_id=org_id, provider=provider, site_id=site_id)
        except CredentialMissing:
            return None

    async def _find(self, org_id: str, provider: str, site_id: str | None) -> Credential | None:
        # Site-scoped credentials win over org-wide ones, so an agency-managed
        # org can hold a default key and a specific client can override it.
        if site_id:
            row = (
                await self.session.execute(
                    select(Credential).where(
                        Credential.org_id == org_id,
                        Credential.provider == provider,
                        Credential.site_id == site_id,
                        Credential.revoked_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if row is not None:
                return row
        return (
            await self.session.execute(
                select(Credential).where(
                    Credential.org_id == org_id,
                    Credential.provider == provider,
                    Credential.site_id.is_(None),
                    Credential.revoked_at.is_(None),
                )
            )
        ).scalar_one_or_none()

    async def revoke(self, credential_id: str) -> None:
        row = (
            await self.session.execute(select(Credential).where(Credential.id == credential_id))
        ).scalar_one_or_none()
        if row is not None:
            row.revoked_at = datetime.now(UTC)
            await self.session.flush()

    # -- integration status -------------------------------------------------

    async def upsert_integration(
        self,
        *,
        org_id: str,
        provider: str,
        site_id: str | None = None,
        account_ref: str = "",
        display_name: str | None = None,
        status: str = "connected",
        scopes: list[str] | None = None,
        capabilities: list[str] | None = None,
        config: dict | None = None,
        credential_id: str | None = None,
    ) -> Integration:
        row = (
            await self.session.execute(
                select(Integration).where(
                    Integration.org_id == org_id,
                    Integration.provider == provider,
                    Integration.site_id == site_id,
                    Integration.account_ref == account_ref,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = Integration(
                org_id=org_id,
                site_id=site_id,
                provider=provider,
                account_ref=account_ref,
            )
            self.session.add(row)
        row.display_name = display_name or row.display_name
        row.status = status
        row.scopes = scopes if scopes is not None else row.scopes
        row.capabilities = capabilities if capabilities is not None else row.capabilities
        row.config = {**(row.config or {}), **(config or {})}
        row.credential_id = credential_id or row.credential_id
        if status == "connected":
            row.last_verified_at = datetime.now(UTC)
            row.last_error = None
            row.error_count = 0
        await self.session.flush()
        return row

    async def mark_error(self, integration_id: str, error: str) -> None:
        row = (
            await self.session.execute(
                select(Integration).where(Integration.id == integration_id)
            )
        ).scalar_one_or_none()
        if row is None:
            return
        row.error_count += 1
        row.last_error = error[:2000]
        # Three consecutive failures is a connection problem, not a blip; the
        # planner then routes around this provider instead of retrying it.
        row.status = "degraded" if row.error_count < 3 else "error"
        await self.session.flush()

    async def list_integrations(self, *, org_id: str, site_id: str | None = None) -> list[Integration]:
        stmt = select(Integration).where(Integration.org_id == org_id)
        if site_id:
            stmt = stmt.where(
                (Integration.site_id == site_id) | (Integration.site_id.is_(None))
            )
        return list((await self.session.execute(stmt)).scalars().all())

    async def connected_providers(self, *, org_id: str, site_id: str | None = None) -> set[str]:
        rows = await self.list_integrations(org_id=org_id, site_id=site_id)
        return {r.provider for r in rows if r.status in ("connected", "degraded")}

    async def expiring_soon(self, *, within_hours: int = 72) -> list[Credential]:
        cutoff = datetime.now(UTC) + timedelta(hours=within_hours)
        return list(
            (
                await self.session.execute(
                    select(Credential).where(
                        Credential.revoked_at.is_(None),
                        Credential.expires_at.is_not(None),
                        Credential.expires_at <= cutoff,
                    )
                )
            ).scalars().all()
        )
