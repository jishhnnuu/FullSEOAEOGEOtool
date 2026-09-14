"""The HTTP application.

Wires the routers, installs the error handling that turns typed domain
exceptions into sensible status codes, and exposes the health and readiness
endpoints a deployment needs.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from seoos.core.config import get_settings
from seoos.core.db import create_all, dispose_engine
from seoos.core.errors import SeoOSError
from seoos.core.logging import bind, configure_logging, get_logger, unbind

log = get_logger("seoos.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    log.info("starting %s in %s", settings.app_name, settings.environment)

    # Fail fast and loudly if the agent roster or the missions are broken.
    # Discovering a broken agent when a client's mission runs is far worse
    # than refusing to start.
    from seoos.agents.registry import get_registry
    from seoos.missions.registry import get_mission_registry
    from seoos.tools import load_all_tools

    tools = load_all_tools()
    agents = get_registry()
    missions = get_mission_registry()
    problems = agents.validate() + missions.validate()
    if problems:
        for problem in problems:
            log.error("configuration problem: %s", problem)
        if settings.is_production:
            raise RuntimeError(f"{len(problems)} configuration problems; refusing to start")
    log.info(
        "loaded %d tools, %d agents, %d missions",
        len(tools.names()), len(agents.keys()), len(missions.keys()),
    )

    if not settings.is_production:
        # Development convenience only. Production runs Alembic.
        await create_all()

    providers = settings.configured_llm_providers()
    if not providers:
        log.warning(
            "No model provider is configured. Deterministic analysis works; "
            "generative steps will return clearly degraded output."
        )
    else:
        log.info("model providers available: %s", ", ".join(providers))

    yield
    await dispose_engine()
    log.info("stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "An autonomous search growth platform. The client connects their "
            "accounts, approves content, and the rest runs itself."
        ),
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_url] if settings.is_production else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        started = time.perf_counter()
        token = bind(path=request.url.path, method=request.method)
        try:
            response = await call_next(request)
        finally:
            unbind(token)
        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        if duration_ms > 5000:
            log.warning("slow request: %s %s took %dms",
                        request.method, request.url.path, duration_ms)
        return response

    @app.exception_handler(SeoOSError)
    async def domain_error(request: Request, exc: SeoOSError):
        # Domain exceptions carry their own status and a machine-readable
        # code, so a client can branch on the code rather than parse prose.
        if exc.http_status >= 500:
            log.error("%s: %s", exc.code, exc.message, extra={"extra_fields": exc.context})
        return JSONResponse(status_code=exc.http_status, content=exc.to_dict())

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "code": "internal_error",
                "message": "Something went wrong on our side. It has been logged.",
            },
        )

    from seoos.api.routes import (
        approvals,
        auth,
        brand,
        content,
        integrations,
        missions,
        reports,
        sites,
    )

    api_prefix = "/api/v1"
    for module in (auth, sites, approvals, content, integrations, missions, brand, reports):
        app.include_router(module.router, prefix=api_prefix)
    app.include_router(reports.public_router, prefix=api_prefix)

    @app.get("/health", tags=["ops"])
    async def health() -> dict:
        return {"status": "ok", "version": app.version}

    @app.get("/ready", tags=["ops"])
    async def ready() -> dict:
        """Readiness: can we reach the database and is the config sane?"""
        from sqlalchemy import text

        from seoos.core.db import session_scope

        checks: dict[str, str] = {}
        try:
            async with session_scope() as session:
                await session.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["database"] = f"error: {exc}"

        from seoos.agents.registry import get_registry
        from seoos.missions.registry import get_mission_registry

        checks["agents"] = str(len(get_registry().keys()))
        checks["missions"] = str(len(get_mission_registry().keys()))
        providers = get_settings().configured_llm_providers()
        checks["model_providers"] = ", ".join(providers) or "none (degraded mode)"

        healthy = checks["database"] == "ok"
        return JSONResponse(
            status_code=200 if healthy else 503,
            content={"ready": healthy, "checks": checks},
        )

    @app.get("/api/v1/capabilities", tags=["ops"])
    async def capabilities() -> dict:
        """What this deployment can do. Useful for support and for the UI."""
        from seoos.agents.registry import get_registry
        from seoos.connectors.registry import CONNECTORS
        from seoos.missions.registry import get_mission_registry
        from seoos.tools import load_all_tools

        settings = get_settings()
        tools = load_all_tools()
        return {
            "version": app.version,
            "agents": len(get_registry().keys()),
            "missions": len(get_mission_registry().keys()),
            "tools": len(tools.names()),
            "connectors": sorted(CONNECTORS),
            "model_providers": settings.configured_llm_providers(),
            "degraded": not settings.configured_llm_providers(),
        }

    return app


app = create_app()
