"""Connector contract.

A connector is a thin, typed wrapper over one external system. It knows how
to authenticate, what it can do, and how to say clearly when it cannot. It
deliberately does not know about agents, missions or approvals: that keeps
the surface testable and lets the resolver reason about failures uniformly.

Every connector declares ``capabilities``. The planner reads those to decide
what is actually possible for a given client rather than attempting work that
will fail three steps later.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
from seoos.core.errors import ConnectorError, CredentialMissing, RateLimited
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors")


@dataclass
class Capability:
    key: str
    description: str
    read: bool = True
    write: bool = False
    requires_scope: str | None = None


@dataclass
class ConnectorResult:
    ok: bool
    data: Any = None
    error: str | None = None
    degraded: bool = False
    cost_usd: float = 0.0
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    meta: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def failure(cls, error: str, **meta) -> ConnectorResult:
        return cls(ok=False, error=error, meta=meta)


class Connector(ABC):
    provider: str = "unknown"
    display_name: str = "Unknown"
    auth_kind: str = "api_key"  # oauth2 | api_key | basic | app_password | token
    capabilities: tuple[Capability, ...] = ()
    docs_url: str = ""

    def __init__(self, credentials: dict[str, Any] | None = None, *, config: dict | None = None):
        self.credentials = credentials or {}
        self.config = config or {}
        self._client: httpx.AsyncClient | None = None

    # -- lifecycle ----------------------------------------------------------

    def http(self, *, base_url: str = "", headers: dict | None = None, timeout: float = 60.0):
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=base_url,
                timeout=httpx.Timeout(timeout),
                headers={"User-Agent": "SEO-OS/0.1", **(headers or {})},
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self.close()

    # -- contract -----------------------------------------------------------

    @abstractmethod
    async def verify(self) -> ConnectorResult:
        """Prove the credential works with a real, cheap call.

        Storing a key is not the same as the key working. Onboarding calls
        this so a client learns about a bad connection immediately rather
        than through a silently empty report three weeks later.
        """

    def can(self, capability: str) -> bool:
        return any(c.key == capability for c in self.capabilities)

    def require(self, *keys: str) -> None:
        missing = [k for k in keys if not self.credentials.get(k)]
        if missing:
            raise CredentialMissing(
                f"{self.display_name} is missing: {', '.join(missing)}",
                context={"provider": self.provider, "missing": missing},
            )

    async def request(
        self,
        method: str,
        url: str,
        *,
        expect_json: bool = True,
        retries: int = 2,
        **kwargs,
    ) -> Any:
        """One place for the retry, rate-limit and error-shaping policy."""
        client = self.http()
        last: Exception | None = None
        for attempt in range(retries + 1):
            try:
                response = await client.request(method, url, **kwargs)
            except httpx.HTTPError as exc:
                last = ConnectorError(f"{self.display_name}: {exc}")
                if attempt < retries:
                    continue
                raise last from exc

            if response.status_code == 429:
                retry_after = response.headers.get("retry-after")
                raise RateLimited(
                    f"{self.display_name} rate limited",
                    context={"retry_after": retry_after},
                )
            if response.status_code in (401, 403):
                raise CredentialMissing(
                    f"{self.display_name} rejected the credential "
                    f"({response.status_code}). It may have expired or lost a scope.",
                    context={"provider": self.provider, "body": response.text[:400]},
                )
            if response.status_code >= 500 and attempt < retries:
                continue
            if response.status_code >= 400:
                raise ConnectorError(
                    f"{self.display_name} returned {response.status_code}: {response.text[:500]}",
                    context={"status": response.status_code},
                )
            if not expect_json:
                return response.text
            if not response.content:
                return {}
            try:
                return response.json()
            except ValueError as exc:
                raise ConnectorError(
                    f"{self.display_name} returned a non-JSON body"
                ) from exc
        raise last or ConnectorError(f"{self.display_name} request failed")


class OAuthConnector(Connector):
    """Shared OAuth 2.0 refresh handling.

    Access tokens expire constantly and a platform that treats that as an
    error instead of a routine refresh generates a support ticket per client
    per week.
    """

    auth_kind = "oauth2"
    token_url: str = ""
    authorize_url: str = ""
    default_scopes: tuple[str, ...] = ()

    async def access_token(self) -> str:
        token = self.credentials.get("access_token")
        expiry = self.credentials.get("expires_at")
        if token and expiry:
            try:
                if datetime.fromisoformat(expiry) > datetime.now(UTC):
                    return token
            except (ValueError, TypeError):
                pass
        elif token and not self.credentials.get("refresh_token"):
            return token
        return await self.refresh()

    async def refresh(self) -> str:
        self.require("refresh_token", "client_id", "client_secret")
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": self.credentials["refresh_token"],
            "client_id": self.credentials["client_id"],
            "client_secret": self.credentials["client_secret"],
        }
        client = httpx.AsyncClient(timeout=30.0)
        try:
            response = await client.post(self.token_url, data=payload)
            if response.status_code >= 400:
                raise CredentialMissing(
                    f"{self.display_name} refresh failed ({response.status_code}). "
                    "The client most likely needs to reconnect the account.",
                    context={"body": response.text[:400]},
                )
            data = response.json()
        finally:
            await client.aclose()

        self.credentials["access_token"] = data["access_token"]
        if data.get("refresh_token"):
            self.credentials["refresh_token"] = data["refresh_token"]
        if data.get("expires_in"):
            from datetime import timedelta

            self.credentials["expires_at"] = (
                datetime.now(UTC) + timedelta(seconds=int(data["expires_in"]) - 60)
            ).isoformat()
        # The caller persists this; a refreshed token that is not saved means
        # a refresh on every single call.
        self.credentials["_refreshed"] = True
        return self.credentials["access_token"]

    async def auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {await self.access_token()}"}


def authorization_url(
    *,
    authorize_url: str,
    client_id: str,
    redirect_uri: str,
    scopes: list[str],
    state: str,
    extra: dict[str, str] | None = None,
) -> str:
    from urllib.parse import urlencode

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        **(extra or {}),
    }
    return f"{authorize_url}?{urlencode(params)}"


async def exchange_code(
    *,
    token_url: str,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    extra: dict[str, str] | None = None,
) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                **(extra or {}),
            },
        )
    if response.status_code >= 400:
        raise ConnectorError(
            f"Token exchange failed ({response.status_code}): {response.text[:400]}"
        )
    data = response.json()
    if data.get("expires_in"):
        from datetime import timedelta

        data["expires_at"] = (
            datetime.now(UTC) + timedelta(seconds=int(data["expires_in"]) - 60)
        ).isoformat()
    return data
