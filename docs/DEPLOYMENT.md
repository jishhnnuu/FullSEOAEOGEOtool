# Deployment

Two shapes, for two different jobs.

| | The hosted Worker | A server installation |
| --- | --- | --- |
| Runs on | One Cloudflare Worker | Docker, or any container host |
| Public site and dashboard | Yes | Yes |
| Crawls and audits any site you enter | Yes | Yes |
| Python API, mission worker, database | No | Yes |
| Runs missions on a schedule, unattended | No, runs when a tab is open | Yes |
| Where the workspace lives | The visitor's browser | Postgres |
| Credentials held | In the visitor's browser | The tenant's, envelope encrypted |
| Users per tenant | One browser | Many, with roles |

The split exists because Cloudflare Workers cannot run a Python process, and
because an edge runtime has no database to put a tenant in.

---

## The hosted Worker

One Worker serves the public site, the dashboard, and the two engine endpoints
the dashboard calls. It stores nothing.

### How a run works there

The audit is implemented twice: once in Python (`packages/seoos/analysis/`) for
the server installation, and once in TypeScript (`apps/web/src/engine/`) for
this one. The TypeScript version is split across two places:

1. **The Worker fetches and parses.** `POST /api/engine/discover` reads
   robots.txt, the sitemaps and the homepage. `POST /api/engine/fetch` takes up
   to four URLs at a time and returns the parsed signals. The browser cannot do
   this itself: cross-origin reads are blocked, and rightly so.
2. **The browser analyses.** The check catalogue, the scoring, the fix
   generation and the strategy all run client side, over the crawl the Worker
   collected. An edge runtime bills CPU per request; a browser tab does not.
3. **The browser stores.** The workspace lives in `localStorage`, and
   `compact()` in `src/lib/store.ts` strips the page bodies before writing,
   because a stored crawl is otherwise several megabytes of body copy.

That trade is stated on screen rather than hidden. What it buys: no account is
required, no data of yours reaches a server of ours, and the first audit costs
nothing to run because it uses no model and no data vendor. What it costs: the
workspace does not follow you to another browser unless you export it, which is
why export and import are on the Settings screen rather than buried.

### Model calls

`POST /api/engine/llm` relays one request to Anthropic, OpenAI, Google or any
OpenAI-compatible endpoint, using a key the browser sends with the request. The
key is never logged, cached or stored, and the platform holds no account with
any model vendor. Everything except long-form drafting works without one.

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

### Pointing it at a server installation

The proxy route in `apps/web/src/app/api/[...path]/route.ts` reads its upstream
per request, so this needs no rebuild. Set a Worker variable:

```
SEOOS_API_URL = https://api.your-domain.com
```

Every `/api/v1/*` path then reaches the Python service from the Worker's own
origin, which removes CORS preflights and third-party cookie problems for
anything talking to it through the dashboard's domain. Without it, those paths
answer 501 and say why.

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
(Fly, Railway, Render, a VM), keep the public site and dashboard on the Worker,
and set `SEOOS_API_URL` on the Worker to the API's public URL. The browser only
ever talks to the Worker's own origin, so there are no CORS preflights and no
third-party cookies.

## Accounts and connections

The public deployment ships with accounts switched off: no database is bound,
so sign-in says why there is nothing to sign in to and the audit runs anyway.
Turning them on is one command plus a Google OAuth client, and it is documented
end to end in [ACCOUNTS.md](./ACCOUNTS.md).

```bash
npm run cf:setup      # creates D1, writes the binding, applies the schema, sets secrets
git commit -am "Bind the D1 database" && git push
```

Nothing about the existing deployment changes: the same Worker serves the same
pages, with four more route groups under `/api` that answer honestly when the
database is absent.
