# Deployment

Two shapes, for two different jobs.

| | The public demo | A real installation |
| --- | --- | --- |
| Runs on | One Cloudflare Worker | Docker, or any container host |
| Dashboard | Yes | Yes |
| Python API, worker, database | No | Yes |
| Crawls, missions, writing | No, it replays a recording | Yes |
| Credentials held | None | The tenant's, encrypted |

The split exists because Cloudflare Workers cannot run a Python process. The
dashboard is a Next.js app and runs there happily. The rest of the platform
(FastAPI, the mission worker, Postgres) needs a container host.

---

## The public demo on Cloudflare

One Worker serves the dashboard and answers `/api/v1/*` from a recording.

### What is in the recording

`scripts/record_demo.py` drives the real FastAPI application in-process, over a
database the real crawler filled, and writes down what the API answered into
`apps/web/src/demo/snapshot.json`. The demo replays that. Nothing in it was
written by hand to look plausible, which is the property that matters: the demo
cannot show a payload shape the API does not produce.

What is measured, and what is not:

- **Measured.** Pages, findings, scores, the crawl itself, the mission traces.
  A real crawl of a real site, with real timings and real costs.
- **Sample records.** Drafts, approvals, the brand profile and the traffic
  series. Writing content needs a model provider and measuring traffic needs a
  Search Console connection; a public demo holds neither. Every sample row is
  marked as such in the row itself, and the banner says so on every screen.

Anything that would need a credential, a worker or a real network call (adding a
site, connecting an account, starting a mission) refuses with an explanation
rather than pretending to succeed.

Each visitor's clicks are kept in a cookie, so approving something changes what
you see and nobody else.

### Deploying it

Cloudflare's dashboard runs `npx wrangler deploy` from the repository root, and
`wrangler.jsonc` carries its own build command, so the settings below are the
defaults and nothing needs changing after the first connect:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | *(none; `wrangler.jsonc` declares it)* |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |

Every push to `main` rebuilds and redeploys. To do it from a terminal instead:

```bash
npm install
npx wrangler deploy
```

The build runs `opennextjs-cloudflare build`, which compiles the Next app and
emits a Worker into `apps/web/.open-next/`. The upload is around 1 MB gzipped,
inside the free plan's limit.

### Pointing the demo at a real backend

The proxy route reads its upstream per request, so this needs no rebuild. Set a
Worker variable:

```
SEOOS_API_URL = https://api.your-domain.com
```

`SEOOS_API_URL` always wins over `SEOOS_DEMO`, so the recording stops being used
the moment a real API is configured.

### Refreshing the recording

```bash
make install
seoos demo --url https://example.com/ --pages 150      # a real crawl
python scripts/seed_demo.py   --org-id <org> --site-id <site>
python scripts/record_demo.py --org-id <org> --site-id <site>
```

The last step rewrites `apps/web/src/demo/snapshot.json`. Commit it and push.

---

## A real installation

Everything, with a database and a worker:

```bash
cp .env.example .env
make keygen        # writes the encryption and signing keys into .env
docker compose up --build
```

That starts Postgres, the API on `:8000`, the mission worker, and the dashboard
on `:3000`. Without a model provider configured the platform still crawls,
audits, scores and reports; the steps that write content mark themselves
degraded rather than failing.

Or without Docker:

```bash
make install
make migrate
make api        # :8000
make worker     # the scheduler and mission runner
make web        # :3000
```

### What to set before it faces the internet

| Variable | Why |
| --- | --- |
| `SEOOS_MASTER_KEY` | Wraps every stored credential. Losing it makes them unrecoverable. |
| `SEOOS_JWT_SECRET` | Signs sessions. |
| `SEOOS_ALLOW_INSECURE_DEV_KEYS=false` | Makes a missing key a hard failure instead of a warning. |
| `SEOOS_DATABASE_URL` | Postgres. SQLite has one writer and missions run concurrently. |
| `SEOOS_ENVIRONMENT=production` | Refuses to start without the two keys above. |

### Hosting the API somewhere with the dashboard on Cloudflare

This works and is a reasonable shape: put the API and worker on a container host
(Fly, Railway, Render, a VM), keep the dashboard on the Worker, and set
`SEOOS_API_URL` on the Worker to the API's public URL. The browser only ever
talks to the Worker's own origin, so there are no CORS preflights and no
third-party cookies.
