"""Shared fixtures.

Every test runs against a real SQLite database rather than mocks, because the
tenancy rules and the finding reconciliation logic only mean anything against
a real query planner.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio

os.environ.setdefault("SEOOS_ENVIRONMENT", "test")
os.environ.setdefault("SEOOS_LOG_LEVEL", "WARNING")


@pytest_asyncio.fixture
async def db():
    """A fresh database per test."""
    from seoos.core.config import get_settings
    from seoos.core.db import create_all, dispose_engine

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "test.db"
        os.environ["SEOOS_DATABASE_URL"] = f"sqlite+aiosqlite:///{path}"
        get_settings.cache_clear()
        await dispose_engine()
        await create_all()
        yield
        await dispose_engine()
        get_settings.cache_clear()


@pytest_asyncio.fixture
async def session(db):
    from seoos.core.db import session_scope

    async with session_scope() as s:
        yield s


@pytest_asyncio.fixture
async def org(session):
    from seoos.core.models import Org

    row = Org(name="Test Org", slug="test-org", plan="trial")
    session.add(row)
    await session.flush()
    return row


@pytest_asyncio.fixture
async def site(session, org):
    from seoos.core.models import Site

    row = Site(
        org_id=org.id,
        name="Example",
        domain="example.com",
        base_url="https://example.com",
        business_type="saas",
        status="active",
        autonomy="assisted",
    )
    session.add(row)
    await session.flush()
    return row


@pytest.fixture
def tenant(org):
    from seoos.core.db import TenantContext

    return TenantContext(org_id=org.id, user_id="test-user", role="owner")


@pytest_asyncio.fixture
async def ctx(session, org, site):
    from seoos.llm.router import ModelRouter
    from seoos.tools.registry import ToolContext

    return ToolContext(
        org_id=org.id,
        site_id=site.id,
        session=session,
        router=ModelRouter(),
        site=site,
        autonomy=site.autonomy,
        agent_key="test",
    )


@pytest_asyncio.fixture
async def client(db):
    """An HTTP client bound to the app, sharing the test database."""
    import httpx
    from httpx import ASGITransport
    from seoos.api.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def authed_client(client):
    res = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "owner@example.co",
            "password": "a-sufficiently-long-password",
            "org_name": "Test Org",
        },
    )
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
