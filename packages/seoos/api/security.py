"""Authentication, authorisation and tenancy resolution.

Two credential types reach the API: a session JWT for a person using the
dashboard, and an API key for a customer's own automation. Both resolve to
the same :class:`TenantContext`, and every route below depends on that
rather than reading an org id from the request.
"""

from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from seoos.core.config import get_settings
from seoos.core.crypto import new_token
from seoos.core.db import TenantContext, get_session
from seoos.core.models import ApiKey, Membership, Org, Site, User

ROLE_ORDER = {"viewer": 0, "approver": 1, "editor": 2, "admin": 3, "owner": 4}

# bcrypt silently truncates anything past 72 bytes, which would make a long
# passphrase no stronger than its first 72 characters. Hashing to a fixed
# 32-byte digest first removes the limit entirely; base64 keeps it free of
# null bytes, which bcrypt also truncates on.
def _prepare(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), hashed.encode())
    except (ValueError, TypeError):
        return False


def _jwt_secret() -> str:
    settings = get_settings()
    secret = settings.jwt_secret
    if not secret:
        if settings.is_production:
            raise RuntimeError("SEOOS_JWT_SECRET is required outside development")
        secret = "insecure-development-jwt-secret-do-not-use"
    return secret


def issue_token(*, user_id: str, org_id: str, role: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": user_id,
            "org": org_id,
            "role": role,
            "iat": now,
            "exp": now + timedelta(minutes=settings.jwt_ttl_minutes),
        },
        _jwt_secret(),
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from None


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full key shown once, prefix stored for lookup, hash stored)."""
    raw = new_token("sk", nbytes=32)
    prefix = raw[:12]
    return raw, prefix, hashlib.sha256(raw.encode()).hexdigest()


async def resolve_tenant(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> TenantContext:
    """The single place a caller's identity becomes a tenant scope."""
    if x_api_key:
        prefix = x_api_key[:12]
        key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
        row = (
            await session.execute(
                select(ApiKey).where(ApiKey.prefix == prefix, ApiKey.revoked_at.is_(None))
            )
        ).scalar_one_or_none()
        # Constant-time comparison: a timing side channel on an API key is a
        # small risk but a free one to remove.
        import secrets

        if row is None or not secrets.compare_digest(row.key_hash, key_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
        row.last_used_at = datetime.now(UTC)
        return TenantContext(
            org_id=row.org_id,
            role="admin",
            actor="system",
            scopes=set(row.scopes or []),
        )

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    payload = decode_token(authorization.split(" ", 1)[1])
    return TenantContext(
        org_id=payload["org"],
        user_id=payload["sub"],
        role=payload.get("role", "viewer"),
        actor="user",
    )


Tenant = Annotated[TenantContext, Depends(resolve_tenant)]
Session = Annotated[AsyncSession, Depends(get_session)]


def require(*roles: str):
    """Route dependency enforcing a minimum role.

    Used as a default value (``tenant: TenantContext = require("editor")``)
    rather than inside Annotated, because FastAPI refuses a parameter that
    carries both an Annotated dependency and a default one.
    """

    async def dependency(tenant: Tenant) -> TenantContext:
        needed = min(ROLE_ORDER.get(r, 99) for r in roles)
        if ROLE_ORDER.get(tenant.role, -1) < needed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action needs the {'/'.join(roles)} role",
            )
        return tenant

    return Depends(dependency)


async def get_site(session: AsyncSession, tenant: TenantContext, site_id: str) -> Site:
    """Load a site, refusing cross-tenant access. Every site route uses this."""
    site = (
        await session.execute(
            select(Site).where(Site.id == site_id, Site.org_id == tenant.org_id)
        )
    ).scalar_one_or_none()
    if site is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return site


async def get_org(session: AsyncSession, tenant: TenantContext) -> Org:
    org = (
        await session.execute(select(Org).where(Org.id == tenant.org_id))
    ).scalar_one_or_none()
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    return org


async def membership_for(session: AsyncSession, user: User, org_id: str | None = None) -> Membership:
    stmt = select(Membership).where(Membership.user_id == user.id)
    if org_id:
        stmt = stmt.where(Membership.org_id == org_id)
    membership = (await session.execute(stmt)).scalars().first()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No organisation for this user")
    return membership
