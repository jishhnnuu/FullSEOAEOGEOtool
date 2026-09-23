# Architecture

## The shape of it

```
             ┌──────────────┐
  browser ──▶│  Next.js web │──▶ /api/[...path] proxy (runtime, not baked)
             └──────────────┘
                     │
             ┌───────▼────────┐        ┌──────────────┐
             │  FastAPI API   │◀──────▶│  Postgres    │
             └───────┬────────┘        │  (or SQLite) │
                     │                 └──────▲───────┘
             ┌───────▼────────┐                │
             │ Mission engine │────────────────┘
             └───────┬────────┘
                     │  waves of steps, each in its own session
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
   ┌────────┐  ┌──────────┐  ┌──────────┐
   │ tools  │  │  agents  │  │ resolver │
   └───┬────┘  └────┬─────┘  └──────────┘
       │            │
       │       ┌────▼─────┐
       │       │ LLM      │ anthropic / openai / google /
       │       │ router   │ openrouter / azure / ollama / echo
       │       └──────────┘
       ▼
  ┌─────────────┐  ┌──────────────┐
  │ connectors  │  │  analysers   │  deterministic, no model, free
  └─────────────┘  └──────────────┘
```

## Layers, lowest first

**`core`** — configuration, database, tenancy, envelope encryption, errors.
The error hierarchy matters more than it looks: the resolver branches on the
*kind* of failure, so raising the right typed exception is what lets the
platform route around a problem rather than stop.

**`llm`** — provider-agnostic model access over plain HTTP. No vendor SDK,
because a vendor SDK is a dependency on that vendor continuing to exist in
the shape you built against. Tool schemas are written once in JSON Schema and
translated per provider. With no provider configured the router falls through
to `echo`, which returns clearly labelled degraded output that the quality
gate then refuses to publish.

**`analysis`** — the deterministic engine: a safe HTTP client, a crawler, a
one-pass HTML parser, 74 checks across 12 categories, and scoring. No model
is involved, so results are reproducible and free. This is the layer that
makes a free audit viable as a customer-acquisition motion.

**`connectors`** — 21 outbound integrations behind one contract. Each one
declares its capabilities, so the planner knows what is actually possible for
a given client rather than attempting work that fails three steps later.

**`tools`** — 60 capabilities agents may invoke. A tool is the *only* way an
agent touches the world, which makes the blast radius of a misbehaving model
exactly the set of registered mutations. Mutations are declared, not inferred,
and the registry refuses to register one that does not state its risk.

**`agents`** — 53 markdown specs plus the runtime that executes them. The
expertise lives in the files, not in Python, so an SEO lead can change how the
platform practises SEO without touching code.

**`missions`** — declarative YAML workflows. Steps run in dependency waves
with `asyncio.gather`, which is where the speed comes from: a monthly audit
runs technical, performance, AEO, content, links and off-page analysis at the
same time.

**`api`** — the HTTP surface, and the only place tenancy is resolved.

## Decisions worth explaining

### Each mission step gets its own database session

A SQLAlchemy `AsyncSession` is not safe for concurrent use, and a wave runs
its steps with `asyncio.gather`. Sharing one session across a wave produced
intermittent "database is locked" failures under SQLite and would have
produced far subtler corruption under Postgres. Each step now opens its own
scope, which also keeps write transactions short enough that a fifteen-minute
crawl does not block every other writer.

### The blackboard is checkpointed, not held in memory

State is committed to `mission_runs.state` at every wave boundary, so a run
interrupted by a deploy resumes rather than restarts, and the API can create
a run row that the worker then *resumes* rather than duplicating.

### Findings are reconciled, never replaced

Re-creating findings on each crawl would destroy the one thing a client wants
to see: whether the list is getting shorter. Each audit updates what is still
there, closes what has gone, and reopens regressions with a counter. A
category-scoped run only closes findings in the categories it actually looked
at.

### The autonomy floor is derived from risk

An earlier version defaulted a tool with no declared `auto_from` to
`"assisted"`, which meant a critical-risk tool would auto-approve at a middling
autonomy level. The floor is now derived from the risk level, and `critical`
maps to "never": no autonomy setting authorises an action that can take a
site out of the index.

### Health scores are capped by their worst severity

A weighted average dilutes a critical problem into invisibility. One page
returning 500 on an otherwise clean 50-page site scored 88 before the cap,
which is not how anyone would describe that site. "Healthy" now always means
nothing critical is outstanding.

### The web app proxies at request time

Next resolves `rewrites()` at build time and bakes the destination into the
route manifest, so a rewrite cannot be repointed per environment. A catch-all
route handler reads the upstream URL per request instead, which means one
built image runs in development, staging and production.

## Data model

43 tables. The ones that carry the design:

| Table | Why it exists |
|---|---|
| `sites` | Everything is scoped to a site; `autonomy` is the single most consequential setting a client has |
| `findings` | Deduplicated by fingerprint so an audit shows a trend, not a fresh wall of red |
| `content_items` | An explicit state machine; the client only ever sees `review` |
| `brand_profiles` | Versioned, so a published page traces to the voice rules in force when it was written |
| `brand_facts` | The claim ledger. A writer may not state anything not here or cited |
| `approvals` | Stores the exact action to replay, so approving is deterministic |
| `mission_runs` | The blackboard, the cost, and the outcome, checkpointed |
| `tool_calls` | Every external action, with arguments and result. The forensic record |
| `resolutions` | Institutional memory, so a problem solved once is never worked twice |
| `experiments` | Split tests with a control group, which is the only honest attribution |
| `audit_log` | Who changed what, before and after, reversible or not |
| `cost_ledger` | Every dollar, attributed to a site and a run |

## Security

- **Credentials** are envelope-encrypted: a per-record data key wrapped by the
  deployment master key. Rotating the master key never rewrites ciphertext,
  and a leaked row is useless alone. No endpoint returns a secret in any form.
- **SSRF**: every outbound fetch resolves DNS first and rejects private,
  loopback, link-local and metadata addresses. The same validation runs at the
  API boundary, so a hostile `base_url` is refused at signup.
- **Tenancy** is enforced at a single choke point. Cross-tenant reads return
  404, not 403, so an id cannot be confirmed by probing.
- **Passwords** are SHA-256 pre-hashed before bcrypt, so a long passphrase is
  not silently truncated at 72 bytes.
- **Refusals** are structural. Link buying, cloaking, doorway pages, review
  manipulation and mass community posting are refused by the policy engine
  regardless of autonomy level, and the resolver may never resolve toward them
  or weaken a gate to make something possible.
