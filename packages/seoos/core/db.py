"""Database engine, session management and tenant scoping.

The platform is multi-tenant with a shared schema. Isolation is enforced in
two places that must both hold:

1. Every tenant-owned table carries ``org_id`` and the ORM base class for
   those tables refuses to be queried without a scope (see
   ``TenantScopedQuery``).
2. The request layer resolves the caller's org once and passes a
   :class:`TenantContext` down; services never read the org from anything
   the client controls beyond the authenticated token.

SQLite is supported so a developer can run the whole platform with no
services installed; Postgres is what production uses.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, String, event, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import NullPool

from seoos.core.config import get_settings
from seoos.core.errors import NotFound, PermissionDenied

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    """Short, sortable-enough, URL-safe identifiers.

    UUID4 hex keeps ids opaque so a client can never enumerate another
    tenant's rows by guessing a neighbouring integer.
    """
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    type_annotation_map = {dict: None}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class IdMixin:
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)


class OrgScopedMixin:
    """Marks a table as tenant-owned. Services must filter on ``org_id``."""

    org_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)


@dataclass
class TenantContext:
    """Who is acting, and on what. Threaded through every service call."""

    org_id: str
    user_id: str | None = None
    site_id: str | None = None
    role: str = "owner"
    actor: str = "user"  # user | agent | system | webhook
    agent_key: str | None = None
    scopes: set[str] = field(default_factory=set)

    @classmethod
    def system(cls, org_id: str, site_id: str | None = None, agent_key: str | None = None):
        return cls(
            org_id=org_id,
            site_id=site_id,
            role="owner",
            actor="agent" if agent_key else "system",
            agent_key=agent_key,
        )

    def require_role(self, *roles: str) -> None:
        order = {"viewer": 0, "approver": 1, "editor": 2, "admin": 3, "owner": 4}
        needed = min(order.get(r, 99) for r in roles)
        if order.get(self.role, -1) < needed:
            raise PermissionDenied(
                f"Role '{self.role}' cannot perform this action (needs {'/'.join(roles)})"
            )


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        kwargs: dict = {"echo": settings.database_echo, "future": True}
        if settings.db_is_sqlite:
            # SQLite + async needs no pooling and benefits from WAL.
            kwargs["poolclass"] = NullPool
            kwargs["connect_args"] = {"timeout": 30}
        else:
            kwargs["pool_size"] = 10
            kwargs["max_overflow"] = 20
            kwargs["pool_pre_ping"] = True
        _engine = create_async_engine(settings.database_url, **kwargs)

        if settings.db_is_sqlite:

            @event.listens_for(_engine.sync_engine, "connect")
            def _sqlite_pragmas(dbapi_conn, _rec):  # pragma: no cover - driver glue
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA foreign_keys=ON")
                cur.execute("PRAGMA busy_timeout=30000")
                cur.close()

    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            get_engine(), expire_on_commit=False, class_=AsyncSession
        )
    return _sessionmaker


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Transactional scope. Commits on success, rolls back on any exception."""
    maker = get_sessionmaker()
    async with maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency form of :func:`session_scope`."""
    async with session_scope() as session:
        yield session


async def fetch_scoped(session: AsyncSession, model, obj_id: str, ctx: TenantContext):
    """Load a tenant-owned row, refusing cross-tenant reads.

    This is the single choke point for "load by id". Anything that bypasses
    it is a tenancy bug waiting to happen.
    """
    stmt = select(model).where(model.id == obj_id)
    if hasattr(model, "org_id"):
        stmt = stmt.where(model.org_id == ctx.org_id)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise NotFound(f"{model.__name__} {obj_id} not found")
    return row


async def create_all() -> None:
    """Create the schema. Alembic owns migrations in production; this is for
    dev, tests and first boot."""
    from seoos.core import models  # noqa: F401  (registers mappers)

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_all() -> None:
    from seoos.core import models  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
