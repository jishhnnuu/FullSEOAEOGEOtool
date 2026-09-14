#!/usr/bin/env python3
"""Record the API's own responses for the seeded demo tenant.

The public demo runs on Cloudflare Workers, which cannot host a Python
process. Rather than reimplement the API in TypeScript and let the two drift,
this drives the real FastAPI application in-process and writes down what it
answers. The Worker then replays those answers.

The point is that the demo cannot invent a shape the API does not produce:
every payload in the snapshot came out of the real serialisers, over the real
database, after a real crawl.

    seoos demo --url https://www.iana.org/ --pages 150
    python scripts/seed_demo.py --org-id <org> --site-id <site>
    python scripts/record_demo.py --org-id <org> --site-id <site>
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "packages"))

import httpx  # noqa: E402

OUT = ROOT / "apps" / "web" / "src" / "demo" / "snapshot.json"


class Recorder:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client
        self.misses: list[str] = []

    async def get(self, path: str, *, optional: bool = False):
        response = await self.client.get(f"/api/v1{path}")
        if response.status_code >= 400:
            if optional:
                self.misses.append(f"{path} -> {response.status_code}")
                return None
            raise SystemExit(f"GET {path} failed: {response.status_code} {response.text[:400]}")
        return response.json()


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org-id", required=True)
    parser.add_argument("--site-id", required=True)
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--password", default="demo-password-please-change")
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()

    from seoos.api.app import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://demo") as client:
        login = await client.post(
            "/api/v1/auth/login", json={"email": args.email, "password": args.password}
        )
        if login.status_code != 200:
            raise SystemExit(f"login failed: {login.status_code} {login.text[:400]}")
        auth = login.json()
        client.headers["authorization"] = f"Bearer {auth['access_token']}"

        rec = Recorder(client)
        site_id = args.site_id

        sites = await rec.get("/sites")
        site = await rec.get(f"/sites/{site_id}")
        dashboard = await rec.get(f"/sites/{site_id}/dashboard")
        findings = await rec.get(f"/sites/{site_id}/findings?limit=2000")
        pages = await rec.get(f"/sites/{site_id}/pages?limit=1000&order=opportunity")
        runs = await rec.get(f"/sites/{site_id}/runs?limit=40")
        schedules = await rec.get(f"/sites/{site_id}/schedules")
        report_live = await rec.get(f"/sites/{site_id}/reports/live", optional=True)
        reports = await rec.get(f"/sites/{site_id}/reports", optional=True)
        grouped = await rec.get(f"/approvals/grouped?site_id={site_id}")
        queue = await rec.get(f"/content/review-queue?site_id={site_id}")
        integrations = await rec.get(f"/integrations?site_id={site_id}")
        catalogue = await rec.get("/integrations/catalogue")
        agents = await rec.get("/agents")
        missions = await rec.get("/missions", optional=True)
        notifications = await rec.get("/notifications", optional=True)
        me = await rec.get("/auth/me")
        brand_profile = await rec.get(f"/sites/{site_id}/brand/profile", optional=True)
        brand_assets = await rec.get(f"/sites/{site_id}/brand/assets", optional=True)
        brand_facts = await rec.get(f"/sites/{site_id}/brand/facts", optional=True)

        traces = {}
        for run in runs or []:
            trace = await rec.get(f"/runs/{run['id']}", optional=True)
            if trace is not None:
                traces[run["id"]] = trace

        # Every content item the review queue links to, plus the ones in other
        # states, so the pipeline counts on the dashboard are all reachable.
        content: dict[str, dict] = {}
        for item in (queue or {}).get("items", []):
            detail = await rec.get(f"/content/{item['id']}", optional=True)
            if detail is not None:
                content[item["id"]] = detail

        approvals: dict[str, dict] = {}
        for batch in (grouped or {}).get("batches", []):
            for item in batch.get("items", []):
                approvals[item["id"]] = item

    snapshot = {
        "meta": {
            "generated_at": datetime.now(UTC).isoformat(),
            "org_id": args.org_id,
            "site_id": args.site_id,
            "login": {"email": args.email, "password": args.password},
            "source": "Recorded from the real API over a real crawl. See scripts/record_demo.py.",
        },
        "auth": {"user": auth.get("user"), "org": auth.get("org"), "role": auth.get("role")},
        "me": me,
        "sites": sites,
        "site": site,
        "dashboard": dashboard,
        "findings": findings,
        "pages": pages,
        "runs": runs,
        "traces": traces,
        "schedules": schedules,
        "report_live": report_live,
        "reports": reports or [],
        "approvals_grouped": grouped,
        "approvals": approvals,
        "content_queue": queue,
        "content": content,
        "integrations": integrations or [],
        "catalogue": catalogue,
        "agents": agents,
        "missions": missions or [],
        "notifications": notifications or [],
        "brand": {"profile": brand_profile, "assets": brand_assets or [], "facts": brand_facts},
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, indent=1, sort_keys=False) + "\n")

    size = out.stat().st_size
    print(f"wrote {out.relative_to(ROOT)}  {size/1024:.0f} KiB")
    print(f"  sites {len(sites or [])}  findings {len(findings or [])}  pages {len((pages or {}).get('pages', []))}")
    print(f"  runs {len(runs or [])}  traces {len(traces)}  content {len(content)}  approvals {len(approvals)}")
    print(f"  agents {(agents or {}).get('total')}  catalogue {sum(len(v) for v in (catalogue or {}).get('by_category', {}).values())}")
    if rec.misses:
        print("  optional endpoints that did not answer:")
        for miss in rec.misses:
            print(f"    {miss}")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("SEOOS_ALLOW_INSECURE_DEV_KEYS", "true")
    raise SystemExit(asyncio.run(main()))
