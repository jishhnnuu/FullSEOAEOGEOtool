# The SEO offering

Everything about the SEO offering in one place. Its sibling is
`docs/offerings/CONTENT-MARKETING.md`; how the two run together, and what
happens when somebody subscribes, is in `docs/offerings/THE-ORGANISATION.md`.

---

## What this offering actually sells

The work an SEO agency does, done rather than described. A company connects
Search Console, Analytics and its CMS, approves what matters, and the
technical fixes, structured data, internal linking, local listings, review
replies, link prospecting and AI answer visibility happen without them.

The line that separates it from every audit tool in the category: **a finding
without a fix is an audit tool, and this is not one.** Anything that ends in
"paste this into your CMS" is unfinished unless no API exists, in which case
the platform says so.

---

## The org chart

```
                         client
                           │
                    account-director          ← the only agent the client talks to
                           │
          ┌────────────────┴────────────────┐
     strategist                      content-director
   (this offering)                (content offering)
          │
   ┌──────┼───────┬─────────┬─────────┬──────────┬───────────┐
RESEARCH TECHNICAL  AEO    OFFPAGE   LOCAL    COMMERCE   CONVERSION
   │        │        │        │        │          │           │
keyword-  tech-    aeo-    digital-  local-   ecommerce-   cro-
researcher auditor  strategist pr    manager  specialist   specialist
serp-     schema-  entity-  link-    citation-
analyst   engineer architect prospector manager
gap-      perf-    citation- link-    review-
analyst   engineer engineer  auditor  manager
cluster-  indexation- ai-visibility- outreach- geo-grid-
architect manager   analyst  specialist analyst
competitor- log-             partnership-
intel     analyst            manager
          intl-engineer
          migration-guard
```

Plus operations reporting to `account-director`: `publisher`, `reporter`,
`qa-tester`, `risk-officer`, `compliance-officer`, `crisis-manager`,
`knowledge-manager`, `onboarding-specialist`, `resolver`.

---

## The missions

| Mission | Runs | What it does |
| --- | --- | --- |
| `onboard_site` | Once | Crawl, connect, baseline, first findings |
| `monthly_audit` | Monthly | Full technical and content audit |
| `weekly_growth_cycle` | Weekly | The recurring loop: measure, decide, fix, report |
| `fix_and_publish` | Per fix | Apply a change and verify it went live |
| `content_production` | Per piece | Brief, draft, verify, edit, review queue |
| `link_building` | Cyclical | Prospect, qualify, draft outreach |
| `local_cycle` | Cyclical | Listings, reviews, geo grid |
| `aeo_tracking` | Cyclical | Visibility inside AI answers |

---

## The invariants that hold this together

These are correctness and security properties, not preferences. Breaking one
is a bug of the worst kind, because the user trusted us.

**Tenant scoping.** Every scoped read goes through `fetch_scoped()` in
`core/db.py`. A cross-tenant read returns 404, never 403, because 403
confirms the row exists. No route writes its own `org_id` filter. The
TypeScript side has the same rule in `src/server/db.ts`.

**Agents reach the world only through tools.** Every tool carries a risk
level and `agents/policy.py` decides whether it can run unattended.
`NEVER_ALLOWED` is never overridable, `ALWAYS_HUMAN` always needs a person,
and a `critical` tool has no autonomy level that auto-approves it.

**Outbound fetches are SSRF-checked.** `analysis/http.py` blocks private
ranges, loopback and metadata endpoints, and repeats the check after every
redirect.

**Credentials are envelope-encrypted.** A per-record data key sealed by the
deployment master key, so rotation never rewrites ciphertext. No route
returns a secret in any shape, including masked, because a mask still
confirms the value.

**Nothing on the server is load-bearing for the audit.** Every server call
from the browser fails quietly and every screen renders without one. A
deployment with no database still audits, still writes fixes, still works.

---

## The rules that decide arguments

**Every number is measured or labelled as not measured.** A score with
nothing behind it does not render a number. This rule cost the project a
false Experience 100 and a false Authority 84, and it is worth more than
either.

**A false positive is more expensive than a miss.** A wrong high-severity
finding teaches the reader to discount the severe ones, which are the only
ones that matter. Narrow a check rather than let it fire loosely.

**Never recommend work already done.** Read what the site already has before
proposing it. Telling a client to claim a Business Profile they have had for
two years loses the room.

**Coverage is stated before conclusions.** A score over 40 of 55 pages is a
score of those 40 pages, and the reader is told that above the number.

**Mentions are weighted above links.** Ahrefs measured 75,000 brands in 2026:
brand mentions correlate with AI Overview visibility at 0.664, backlinks at
0.218. A model has no link graph, it has text. An unlinked mention is treated
as most of the value already delivered.

**Risk has two numbers, never one.** `link-risk.ts` separates scheme risk
from waste risk, because a link that does nothing and a link that could earn
a manual action need opposite responses. A disavow file is refused unless a
manual action is reported.

**A contextual link needs a sentence that already exists.** Inserting one
anywhere else means writing a sentence, which is a content change pretending
to be a linking change.

**An incomplete fix never reaches the queue.** `fixIsComplete()` rejects
empty payloads and `REPLACE:` markers. The queue is a promise that everything
in it can ship as-is.

**A stage is blocked, never guessed.** `progress.ts` refuses to score the
competitive stage without Search Console, because choosing which page to
rewrite from a proxy wastes the most expensive work in the programme.

**A report never substitutes crawl movement for business results.**
`compareRuns()` drops any score whose `measured` flag is false, and the
report says so in its first paragraph rather than filling the space.

---

## The two engines

Cloudflare Workers cannot run Python, so the public deployment runs a second
implementation of the audit in TypeScript.

- **The Worker fetches and parses.** `src/engine/fetcher.ts` reads robots.txt,
  sitemaps and pages in batches of a few URLs per request, because an edge
  runtime bills CPU per request.
- **The browser analyses and stores.** `checks.ts`, `score.ts`, `fixes.ts`
  and `strategy.ts` run client side; `src/lib/store.ts` keeps the workspace
  in `localStorage`.

`src/engine/catalog.ts` shares its codes, severities and weightings with
`analysis/findings.py`, so the same problem scores the same way in both. A
code that exists in both must never disagree.

---

## Where this stops

- **No model key of ours, ever.** Drafting relays the tenant's own key and
  never stores it. The audit, the fixes, the schema, the briefs and the link
  plans are deterministic and need no key at all.
- **It cannot read Google's results pages.** Search engines block automated
  queries and their terms forbid scraping.
- **Scheduled crawls wait for a tab.** The audit runs in the browser, so
  `JOBS` in `schedule.ts` carries `runsHeadless` and only the measurement
  sample and the report have it. A schedule that quietly does nothing is
  worse than no schedule.
- **Outreach drafts, it does not send.** `composeUrl()` opens the user's own
  mail client with the fields filled. A template burns the sender's domain,
  and it is their domain.
