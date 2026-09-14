"""Command line entry points.

    seoos serve        run the API
    seoos worker       run the scheduler and mission worker
    seoos keygen       generate a master key
    seoos check        validate agents, missions and tools
    seoos migrate      create the schema
    seoos demo         seed a demo tenant and run an audit
    seoos run          run one mission for one site
"""

from __future__ import annotations

import argparse
import asyncio
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="seoos", description="SEO OS")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Run the API server")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")

    worker = sub.add_parser("worker", help="Run the scheduler and mission worker")
    worker.add_argument("--interval", type=int, default=60)
    worker.add_argument("--once", action="store_true", help="Run one pass and exit")

    sub.add_parser("keygen", help="Generate a master encryption key")
    sub.add_parser("check", help="Validate agents, missions and tools")
    sub.add_parser("migrate", help="Create the database schema")

    demo = sub.add_parser("demo", help="Seed a demo tenant and audit a site")
    demo.add_argument("--url", default="https://www.iana.org/")
    demo.add_argument("--email", default="demo@example.com")
    demo.add_argument("--pages", type=int, default=15)

    run = sub.add_parser("run", help="Run one mission")
    run.add_argument("mission")
    run.add_argument("--site-id", required=True)
    run.add_argument("--org-id", required=True)
    run.add_argument("--dry-run", action="store_true")

    args = parser.parse_args(argv)

    if args.command == "serve":
        import uvicorn

        uvicorn.run(
            "seoos.api.app:app", host=args.host, port=args.port, reload=args.reload
        )
        return 0

    if args.command == "keygen":
        from seoos.core.crypto import generate_master_key

        print("SEOOS_MASTER_KEY=" + generate_master_key())
        print("SEOOS_JWT_SECRET=" + generate_master_key())
        print("\nPut these in your .env. Losing the master key makes every stored")
        print("credential unrecoverable, so back it up somewhere safe.")
        return 0

    return asyncio.run(_async_main(args))


async def _async_main(args) -> int:
    from seoos.core.config import get_settings
    from seoos.core.logging import configure_logging

    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)

    if args.command == "check":
        return await _check()
    if args.command == "migrate":
        from seoos.core.db import create_all

        await create_all()
        print("Schema created.")
        return 0
    if args.command == "worker":
        from seoos.missions.scheduler import tick, worker_loop

        if args.once:
            ran = await tick()
            print(f"Ran {ran} due schedules.")
            return 0
        await worker_loop(interval_seconds=args.interval)
        return 0
    if args.command == "demo":
        return await _demo(args)
    if args.command == "run":
        from seoos.missions.scheduler import run_mission

        run = await run_mission(
            mission_key=args.mission,
            org_id=args.org_id,
            site_id=args.site_id,
            trigger="manual",
            dry_run=args.dry_run,
        )
        print(f"{run.mission_key}: {run.status} in {run.duration_ms}ms for ${run.cost_usd:.4f}")
        print(run.summary or "")
        return 0 if run.status in ("succeeded", "partial") else 1
    return 1


async def _check() -> int:
    from seoos.agents.registry import get_registry
    from seoos.missions.registry import get_mission_registry
    from seoos.tools import load_all_tools

    tools = load_all_tools()
    agents = get_registry()
    missions = get_mission_registry()

    print(f"tools:    {len(tools.names())}")
    print(f"agents:   {len(agents.keys())}")
    print(f"missions: {len(missions.keys())}")

    problems = agents.validate() + missions.validate()
    if problems:
        print(f"\n{len(problems)} problems:")
        for problem in problems:
            print(f"  ! {problem}")
        return 1
    print("\nEverything validates.")
    return 0


async def _demo(args) -> int:
    """Seed a working tenant and run a real audit, with no API keys needed."""
    from urllib.parse import urlparse

    from sqlalchemy import select

    from seoos.api.security import hash_password
    from seoos.core.db import create_all, session_scope
    from seoos.core.models import Membership, Org, Site, User
    from seoos.llm.router import ModelRouter
    from seoos.missions import MissionEngine
    from seoos.missions.spec import MissionSpec

    await create_all()
    domain = (urlparse(args.url).hostname or "example.com").lower()

    async with session_scope() as session:
        org = (
            await session.execute(select(Org).where(Org.slug == "demo"))
        ).scalar_one_or_none()
        if org is None:
            org = Org(name="Demo Organisation", slug="demo", plan="trial")
            session.add(org)
            await session.flush()
            user = User(
                email=args.email, name="Demo User",
                password_hash=hash_password("demo-password-please-change"),
            )
            session.add(user)
            await session.flush()
            session.add(Membership(org_id=org.id, user_id=user.id, role="owner"))

        site = (
            await session.execute(
                select(Site).where(Site.org_id == org.id, Site.domain == domain)
            )
        ).scalar_one_or_none()
        if site is None:
            site = Site(
                org_id=org.id, name=domain, domain=domain, base_url=args.url,
                business_type="unknown", status="active", autonomy="propose",
            )
            session.add(site)
            await session.flush()
        org_id, site_id = org.id, site.id

    print(f"\norg:  {org_id}\nsite: {site_id}  ({args.url})")
    print(f"login: {args.email} / demo-password-please-change\n")

    spec = MissionSpec.from_dict({
        "key": "demo_audit",
        "name": "Demo audit",
        "budget_usd": 1.0,
        "steps": [
            {"id": "state", "type": "tool", "tool": "report.site_state"},
            {"id": "robots", "type": "tool", "tool": "crawl.robots", "needs": ["state"]},
            {"id": "crawl", "type": "tool", "tool": "crawl.site",
             "args": {"max_pages": args.pages, "max_depth": 3}, "needs": ["state"]},
            {"id": "findings", "type": "tool", "tool": "report.findings",
             "args": {"limit": 15}, "needs": ["crawl"]},
        ],
    })

    async with session_scope() as session:
        router = ModelRouter()
        engine = MissionEngine(session, router=router)
        run = await engine.run(spec, org_id=org_id, site_id=site_id, trigger="manual")
        state = dict(run.state or {})
        await router.close()

    crawl = state.get("crawl") or {}
    print(f"\n{run.summary}\n")
    if crawl.get("scores"):
        for name, score in crawl["scores"].items():
            print(f"  {name:10} {score}")
    findings = (state.get("findings") or {}).get("findings", [])
    if findings:
        print(f"\ntop findings ({len(findings)} shown):")
        for f in findings[:10]:
            print(f"  [{f['severity']:8}] {f['code']:30} {(f['url'] or 'site-wide')[:44]}")
    print("\nStart the API with:  seoos serve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
