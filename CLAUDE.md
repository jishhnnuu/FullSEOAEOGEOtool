# SEO OS: project instructions

## What this is

An autonomous search growth platform. A company connects a site, approves the
content, and the work an SEO agency would do happens without them: technical
fixes, content production, structured data, internal linking, local listings,
review replies, link prospecting and outreach, AI answer visibility, and the
reporting that explains what changed.

It is not an audit tool. Audit tools say what is wrong and leave the fixing to
someone else. Anything added here should do the work, not describe it.

```
53 agents · 8 missions · 60 tools · 21 connectors · 71 checks · 43 tables · 141 tests
```

## This repository stands alone

It shares no code, history, dependency or deployment with any other project.
Nothing here should import from, refer to, or be made to depend on another
repository, and no work from here belongs anywhere else. If a task seems to
need that, stop and ask.

## Layout

```
packages/seoos/
  api/            FastAPI app, routes, schemas, auth. Prefix /api/v1.
  agents/         Runtime, tool-use loop, policy engine, and roster/ (53 specs)
  missions/       Declarative YAML workflows, the DAG engine, the scheduler
  tools/          Everything an agent can do to the world. Registry-gated.
  connectors/     GSC, GA4, GBP, CMSes and the rest, plus the capability map
  llm/            Provider-agnostic model layer, raw HTTP, no vendor SDK
  analysis/       Crawler, checks, scoring, the safe HTTP client
  core/           Config, models (43 tables), db session, crypto, errors
  services/       Approvals, content, findings, credentials, audit log
apps/web/         Next.js: the public site and the dashboard. Plain CSS.
  src/app/(marketing)/  The public pages. No sign-in in front of them.
  src/app/app/    The signed-in workspace
  src/engine/     The TypeScript audit engine: crawl, checks, fixes, strategy
  src/lib/        The browser-held workspace store and the connector catalogue
scripts/          Reference generator, demo seeder
docs/reference/   Generated from the registries. Never edit by hand.
deploy/           Dockerfiles. wrangler.jsonc at the root is Cloudflare.
```

## Commands

| Command | What it does |
| --- | --- |
| `make install` | Virtualenv, Python deps, npm workspace |
| `make check` | Validate the roster, missions and tools. Run this first. |
| `make demo` | Seed a tenant and audit a real site, no API keys needed |
| `make api` / `make worker` / `make web` | The three processes |
| `make test` / `make lint` | 141 tests; ruff and tsc |
| `make docs` | Regenerate `docs/reference` from the registries |
| `make cf-preview` | The Cloudflare Worker locally on :8788 |
| `make docker` | Whole stack with Postgres |

## Invariants

These are load-bearing. Breaking one is a security or correctness bug, not a
style disagreement.

- **Tenant scoping.** Every scoped read goes through `fetch_scoped()` in
  `core/db.py`. A cross-tenant read returns 404, never 403, because 403 confirms
  the row exists. Do not hand-roll an `org_id` filter in a route.
- **Agents reach the world only through tools.** A tool is registered with a
  risk level, and `agents/policy.py` decides whether it can run unattended.
  `NEVER_ALLOWED` is never overridable, `ALWAYS_HUMAN` always needs a person,
  and `RISK_AUTONOMY_FLOOR` maps risk to the minimum autonomy level. A
  `critical` tool has no autonomy level that auto-approves it.
- **Outbound fetches are SSRF-checked.** Use `analysis/http.py`:
  `validate_url()`, `resolve_and_check()` and `SafeHttpClient`. They block
  private ranges, loopback, metadata endpoints and DNS rebinding, and the
  check is repeated after redirects.
- **Credentials are envelope-encrypted.** `core/crypto.py`: a per-record data
  key sealed by the deployment master key, so `rewrap()` rotates without
  rewriting ciphertext. Never log, return or persist a plaintext secret.
- **One session per concurrent task.** A SQLAlchemy `AsyncSession` cannot be
  shared across `asyncio.gather`. Mission steps each open their own
  `session_scope()`. Do not pass a session into concurrent work.
- **Commit before a long network phase.** A crawl holding a write transaction
  open for a minute locks SQLite and starves Postgres.
- **`docs/reference` is generated.** Adding a tool, check, agent or mission
  means running `make docs` and committing the result. CI fails if it is stale.

## The public deployment

Cloudflare Workers cannot run Python, so the public deployment runs a second
implementation of the audit, in TypeScript, split across two places:

- **The Worker fetches and parses.** `src/engine/fetcher.ts` and the two routes
  under `src/app/api/engine/` read robots.txt, the sitemaps and the pages, in
  batches of a few URLs per request. An edge runtime bills CPU per request, so
  a hundred-page crawl is a hundred small requests, not one long one.
- **The browser analyses and stores.** `src/engine/checks.ts`, `score.ts`,
  `fixes.ts` and `strategy.ts` run client side over the crawl, and
  `src/lib/store.ts` keeps the workspace in `localStorage`.

Three rules hold when touching it:

- Nothing is invented. Every number on every screen came from the crawl that
  produced it. A capability that needs a credential says so and degrades with
  a reason; it never pretends to have succeeded.
- The catalogue in `src/engine/catalog.ts` shares its codes, severities and
  weightings with `analysis/findings.py`, so the same problem scores the same
  way in both engines. It is currently a superset: it carries extra codes the
  browser engine can emit from a crawl alone. A code that exists in both must
  never disagree, and the extras belong in the Python catalogue too. That is
  the next piece of work on this side.
- No model key of ours, ever. Drafting relays the tenant's own key through
  `src/app/api/engine/llm/route.ts` and never stores it. Everything else (the
  audit, the fixes, the schema, the briefs, the link plans) is deterministic
  and needs no key at all. That property is load-bearing: the platform has to
  keep working with every external account disconnected.

## Writing rules

The product's own `humanizer` agent strips machine-writing tells from generated
copy. Prose written here, in docs, commit messages and UI strings, holds to the
same standard.

- **No em dashes (U+2014) or en dashes (U+2013) as punctuation.** Use a comma,
  a colon, a full stop, or rewrite. This is the single most reliable tell.
- Vary sentence length. Uniformity is the second most reliable tell.
- Avoid: "delve", "leverage" as a verb, "seamless", "robust", "unlock",
  "elevate", "in today's fast-paced world", "it's important to note", and
  closing paragraphs that restate what was just said.
- Say what a thing does and what it costs. Do not sell it.

## Before committing

```bash
make check && make lint && make test && make docs
```

Then confirm `git diff --stat docs/reference` is empty. For a change touching
`apps/web`, also run `npx wrangler deploy --dry-run --outdir /tmp/w` so a
broken Cloudflare build fails locally rather than on the live site.

## Deployment

Push to `main`. Cloudflare builds from `wrangler.jsonc` at the repository root
and deploys the Worker automatically. A server installation is Docker Compose,
or the three processes above with Postgres. `SEOOS_API_URL` on the Worker
additionally proxies `/api/v1` to that installation, read per request, with no
rebuild.
