# SEO OS

An autonomous search growth platform. A company connects their site, approves
the content, and everything an SEO agency would do happens without them.

This is not an audit tool. Audit tools tell you what is wrong; you still need
someone to fix it. This does the work: technical fixes, content production,
structured data, internal linking, local listings, review replies, link
prospecting and outreach, AI answer visibility, and the reporting that
explains what changed and why.

## Status

Everything described here runs. The platform has been exercised end to end
against live websites: crawl, analyse, score, persist, reconcile, report,
through the API and through the dashboard.

```
53 agents · 8 missions · 60 tools · 21 connectors · 71 checks · 43 tables · 141 tests
```

## Quick start

No API keys are needed to see it work.

```bash
cd platform
python3 -m venv .venv && .venv/bin/pip install -e ".[dev,extract]"
export PYTHONPATH=$PWD/packages

.venv/bin/python -m seoos.cli check      # validate the roster and missions
.venv/bin/python -m seoos.cli demo       # seed a tenant and audit a real site
.venv/bin/python -m seoos.cli serve      # API on :8000

cd apps/web && npm install && npm run dev # dashboard on :3000
```

Or the whole stack with Postgres:

```bash
cp .env.example .env
make keygen            # paste the two keys into .env
docker compose up --build
```

## How it works

A **mission** is a declarative workflow. Its steps are either deterministic
tool calls or **agents**, run in dependency waves so independent work happens
concurrently. Agents can only touch the world through **tools**, and every
mutating tool declares its risk, which the **policy engine** turns into a
decision: ship it, or put it in front of a human.

```
schedule ──▶ mission ──▶ waves of steps ──▶ tools ──▶ connectors ──▶ the client's site
                │                    │
                │                    └──▶ agents ──▶ model router ──▶ any provider
                │
                └──▶ blackboard, checkpointed every wave
```

### The client's job

One thing: approve content. Everything else is either done automatically or
batched into a single decision.

Five autonomy levels control how much runs unattended:

| Level | What happens |
|---|---|
| `observe` | Analyse and report. Nothing changes |
| `propose` | Everything is drafted, the client approves each item |
| `assisted` | Reversible technical fixes ship alone. All content is reviewed |
| `managed` | Pre-approved content types publish too |
| `autopilot` | Everything inside policy ships. The client gets a digest |

Site-wide and irreversible changes need a human at **every** level. No
setting authorises robots.txt edits, mass redirects, a disavow file, or bulk
noindex.

### What it refuses

Bought or exchanged links, private blog networks, cloaking, doorway pages,
scraped or spun content, fake or gated reviews, hidden text, automated
community posting, impersonation. Refused by the policy engine regardless of
autonomy, and the resolver may never resolve toward them or weaken a gate to
make one possible.

## No dependency on any one vendor

The platform talks to model providers over plain HTTP with no vendor SDK.
Anthropic, OpenAI, Google, OpenRouter, Azure and a local Ollama endpoint are
all first-class, a tenant can bring their own key so their workload never
touches the platform's account, and with no provider configured at all the
deterministic analysis still runs and generative steps return clearly
labelled degraded output rather than failing.

There is no dependency on any hosted agent runtime. It is a FastAPI service,
a worker and a Next.js app.

## What you connect, and what each unlocks

Nothing is required. The audit runs on the public site alone.

| Connect | Unlocks |
|---|---|
| Google Search Console | Real keyword targets, striking-distance wins, click-through gaps |
| Google Analytics 4 | Reporting in revenue rather than rankings |
| WordPress / Shopify / Webflow / Ghost / Contentful / Sanity / Strapi / GitHub | Approved content goes live by itself |
| Google Business Profile | Posts, review replies, profile fixes, map pack tracking |
| DataForSEO or Serper | SERPs, keyword volumes, competitor tracking, geo-grids |
| Moz | Authority scoring and link prospect qualification |
| IndexNow / Bing Webmaster | Recrawl in minutes instead of days |
| Your SMTP or SendGrid | Outreach sent from your own domain, never ours |

The dashboard turns every gap into "connect X and we can do Y".

## Layout

```
platform/
  packages/seoos/
    core/         config, database, tenancy, encryption, 43 models
    llm/          provider-agnostic model access, pricing, embeddings
    analysis/     crawler, parser, 71 checks, scoring   (no model needed)
    connectors/   21 integrations behind one contract
    tools/        60 capabilities agents may invoke
    agents/       runtime, policy engine, resolver, 53 markdown specs
    missions/     engine, scheduler, 8 YAML workflows
    services/     approvals, findings, content, credentials, audit
    api/          FastAPI routes and security
  apps/web/       Next.js dashboard
  tests/          141 tests
  docs/           architecture, agents, market analysis, operations
```

## Documentation

**Written**

- [Market analysis](docs/MARKET-ANALYSIS.md) — what the best tools do, the
  eight gaps, and what this does about each
- [Architecture](docs/ARCHITECTURE.md) — layers, decisions and why each was made
- [The agency](docs/AGENTS.md) — how the roster works and the resolver ladder
- [Operations](docs/OPERATIONS.md) — running it, scaling it, costing it
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

**Generated from the code** (`make docs`, checked in CI so it cannot drift)

- [Tools](docs/reference/TOOLS.md) — all 60, with parameters, risk and gating
- [Checks](docs/reference/CHECKS.md) — all 71, with impact, effort and the fix
- [Agents](docs/reference/AGENTS.md) — all 53, with tools, limits and the org chart
- [Missions](docs/reference/MISSIONS.md) — all 8, with execution order per step
- [Connectors](docs/reference/CONNECTORS.md) — all 21, with fields and the capability matrix
- [Data model](docs/reference/DATA-MODEL.md) — all 43 tables, every column
- [API](docs/reference/API.md) — every endpoint, plus `openapi.json`
- [Configuration](docs/reference/CONFIGURATION.md) — every environment variable

## Provenance

Some of the SEO methodology here, the shape of the check catalogue, the
resolver ladder and the machine-writing heuristics, was first worked out in
an open-source Claude Code plugin by the same author. The thinking carried
over. Nothing else did.

This is a standalone product with its own database, tenancy, authentication,
scheduler, model access and runtime. It shares no code, no dependency and no
deployment with that plugin, and the two are not designed to run together.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
