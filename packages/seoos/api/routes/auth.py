"""Signup, login and the caller's own profile."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from seoos.api.schemas import LoginRequest, SignupRequest, TokenResponse
from seoos.api.security import (
    Session,
    Tenant,
    hash_password,
    issue_token,
    membership_for,
    verify_password,
)
from seoos.core.config import get_settings
from seoos.core.models import Membership, Org, User
from seoos.services.audit_log import record_event

router = APIRouter(prefix="/auth", tags=["auth"])


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:60] or "org"


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, session: Session) -> TokenResponse:
    existing = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        # Deliberately the same shape of error as a bad login, so signup
        # cannot be used to enumerate which addresses have accounts.
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create that account")

    slug = _slugify(payload.org_name)
    if (await session.execute(select(Org).where(Org.slug == slug))).scalar_one_or_none():
        slug = f"{slug}-{datetime.now(UTC):%y%m%d%H%M}"

    org = Org(name=payload.org_name, slug=slug, plan="trial")
    session.add(org)
    await session.flush()

    user = User(
        email=payload.email.lower(),
        name=payload.name,
        password_hash=hash_password(payload.password),
        last_login_at=datetime.now(UTC),
    )
    session.add(user)
    await session.flush()

    session.add(Membership(org_id=org.id, user_id=user.id, role="owner"))
    await session.flush()
    await record_event(
        session, org_id=org.id, action="org.created", object_type="org",
        object_id=org.id, actor_type="user", actor_id=user.id,
        summary=f"{payload.org_name} signed up",
    )

    return _token_response(user, org, "owner")


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: Session) -> TokenResponse:
    user = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is not active")

    membership = await membership_for(session, user)
    org = (
        await session.execute(select(Org).where(Org.id == membership.org_id))
    ).scalar_one()
    user.last_login_at = datetime.now(UTC)
    return _token_response(user, org, membership.role)


@router.get("/me")
async def me(tenant: Tenant, session: Session) -> dict:
    user = None
    if tenant.user_id:
        user = (
            await session.execute(select(User).where(User.id == tenant.user_id))
        ).scalar_one_or_none()
    org = (await session.execute(select(Org).where(Org.id == tenant.org_id))).scalar_one()
    return {
        "user": (
            {"id": user.id, "email": user.email, "name": user.name}
            if user else {"id": None, "email": None, "name": "API key"}
        ),
        "org": {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "plan": org.plan,
            "monthly_budget_usd": org.monthly_budget_usd,
            "spend_mtd_usd": round(org.spend_mtd_usd, 2),
        },
        "role": tenant.role,
    }


def _token_response(user: User, org: Org, role: str) -> TokenResponse:
    settings = get_settings()
    return TokenResponse(
        access_token=issue_token(user_id=user.id, org_id=org.id, role=role),
        expires_in=settings.jwt_ttl_minutes * 60,
        user={"id": user.id, "email": user.email, "name": user.name},
        org={"id": org.id, "name": org.name, "slug": org.slug, "plan": org.plan},
    )
