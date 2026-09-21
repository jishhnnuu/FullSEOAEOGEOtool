# The work list between here and a product people buy

Written 20 September 2026. This is the plan, and it opens with the finding
that sets its order.

Read `docs/opinion/002-2026-09-20.md` before this one. Nothing here overrides
it. The positioning recommendation there still holds: sell the audit, grow
into the retainer claim.

Competitors are discussed in `docs/COMPETITORS.md`, which stays deliberately
general: the field, the shapes of product in it, and the two technical facts
that decide the category. Named teardowns of individual companies are kept out
of this repository.

---

## The finding that sets the order of everything below

Our own engine, run against our own live site before any of this work:

```
8 pages · 42 findings · health 84.0 · aeo 51.5
```

A well-run competitor site measured on the same day scored eleven points higher
on AI answer readiness. They published an llms.txt; we returned 404. They
shipped structured data on every page; we shipped none. They named every AI
crawler explicitly in robots.txt; we served a default file with no directives
in it at all. They had a sitemap; we had none.

Our own findings on our own site:

| Severity | Code | Count |
| --- | --- | --- |
| high | analytics_missing | 8 |
| high | no_sitemap | 1 |
| medium | canonical_missing | 8 |
| medium | schema_missing | 8 |
| medium | no_author_attribution | 7 |
| medium | no_direct_answer | 2 |
| medium | duplicate_title | 1 |
| medium | entity_unclear | 1 |
| medium | h1_missing | 1 |
| medium | no_internal_links_out | 1 |
| low | title_too_short | 3 |
| low | missing_llms_txt | 1 |

A tool that sells AEO and cannot pass its own AEO checks has no argument to
make. That is not a marketing task that waits for a marketing phase. It is the
credibility precondition for every other item in this document, it was roughly
one day of work, and the tool had already written most of the fixes.

---

## Progress against this plan

Appended to rather than rewritten, so the gap between what was planned and what
shipped stays visible.

**Phase 0, done.** The engine defects are fixed with regression tests. The site
passes its own checks: sitemap, llms.txt, robots naming every search and AI
agent, an entity graph defined once, canonicals, an edge-rendered OG card.
`/proof` runs the audit against this deployment live and publishes the findings
still outstanding. Two guards gate the build, `brand:check` and `seo:check`,
the second of which exists because fixing the SEO layer introduced a cascading
canonical that pointed eleven pages at the homepage.

**Phase 1, partly done.** Billing exists and is provider-agnostic, quotas are
enforced in the Worker, and the plan definition is single-sourced so the
pricing page cannot drift from enforcement. What remains is external: the
domain, the four billing values, the D1 binding and the Google OAuth client.
`docs/LAUNCH.md` is the checklist.

One Phase 1 item is untouched and it is the big one. **The headless crawl** has
not been built, so a scheduled audit still waits for a browser tab and
"retainer" is not yet an honest word.

**The approval queue is done on the findings screen.** `batches.ts` collapses
findings into decisions by decision character, with site-wide changes and
anything writing prose deliberately left out of the batches. The approvals
screen itself has not had the same treatment.

**Phase 3, started.** Ten free tools, comparison pages, sixteen glossary
entries and the JavaScript crawler essay, which is roughly 46 indexable pages.
The best-resourced competitors in this category run between 140 and 500. The
tools are a different class of asset though: theirs are word counters, ours run
the real catalogue against the visitor's real page.

**The original research dataset is done and it is the best asset on the site.**
A hundred SaaS sites measured for crawler access, llms.txt adoption, structured
data and extractability, published with the method, the denominators, the
refused sites and all hundred rows. It exists because the audit costs nothing
per run, which is an architecture difference before it is a marketing one. It
should be refreshed quarterly so it becomes a cited series rather than one post.

**Phases 4 and 5, untouched.** No distribution, no launch posts, no
directories, no funnel beyond the free audit itself.

---

## Phase 0. Earn the right to be believed

**Target: one week. Nothing here needs money, a company, or a decision.**

### 0.1 Fix the defects in our own engine

A wrong high-severity finding teaches the reader to discount the severe ones,
which are the only ones that matter. Every defect of that class is a priority
over every feature.

Then reconcile the catalogues: 90 TypeScript, 74 Python, codes present in one
engine only, and a README banner that has been wrong before.

### 0.2 Pass our own checks

Take the findings above and ship the fixes. The engine generates most of them
already, which is the demo:

- `app/sitemap.ts` and a sitemap reference in robots.txt
- `app/robots.ts` naming GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot,
  Google-Extended, Bytespider, Amazonbot, CCBot and the rest, each allowed
  explicitly
- `/llms.txt`, generated by `buildLlmsTxt()` in `answers.ts`, which exists
- Organization, SoftwareApplication, FAQPage and BreadcrumbList JSON-LD
- Canonical tags, one H1 per page, an OG image, unique titles
- Privacy-respecting analytics, because `analytics_missing` fired eight times
  and we cannot measure any of the rest of this plan without it

**Make the proof public.** A page at `/proof` showing our own audit, scored by
our own catalogue, updated on every deploy, with the findings we have not fixed
still listed. Nobody in this category does that. It is the single cheapest
piece of differentiation available and it costs one route.

---

## Phase 1. Make it buyable

**Target: three to four weeks. This is the phase that decides whether any of
the rest matters.**

The competition's advantage is not their engine. It is that a founder can give
them money on a Tuesday. Everything below is the checkout page.

### 1.1 A name and a domain

`fullseoaeogeotool.jishhnnuu.workers.dev` cannot be said out loud, cannot be put
on a slide, and will not be cited by an answer engine as a brand because it is
not one. Buy the domain, move the Worker to it, set `PUBLIC_BASE_URL`, and
update both Google OAuth redirect URIs.

### 1.2 Provision the accounts that are already built

`docs/ACCOUNTS.md` describes four browser-only steps. The code is written and
degrades politely while it is off. Turn it on.

Then start Google verification for the Analytics scope, because it is a
sensitive scope, it takes weeks, and it is on the critical path for the
revenue-reporting claim.

### 1.3 Payments

`docs/BILLING.md` covers the four values. Per site per month, not credits:
credits make cost unforecastable for the buyer least able to absorb a surprise,
and needing several paragraphs to explain the unit is itself the tell.

Use a merchant of record rather than raw card processing unless there is a
reason not to. A solo operator selling into the EU and UK should not be
handling VAT by hand.

### 1.4 The schedule that runs without a tab

This is the largest genuine product gap and the one that decides whether the
word "retainer" is honest.

Today: `schedule.ts` carries `runsHeadless` per job, and only the measurement
sample and the report have it. The audit runs in the browser, so a scheduled
crawl waits for someone to open the app. The product says so on screen, which
is the right handling of a limitation and the wrong thing to still have.

Options, cheapest first:

1. **Run the crawl in the Worker for paying sites.** The fetcher and parser
   already run there. The checks, scoring and fixes are pure functions over a
   crawl report and do not need a DOM. Moving them behind the cron handler is
   mostly plumbing plus a durable queue.
2. **A small always-on worker** next to the Python stack for Growth and above,
   which already exists as `seoos worker`.

Free stays in the browser. That preserves the property that a deployment with
no database still audits.

### 1.5 The approval queue at scale

Opinion 001 named it: a real site produces 150 findings, the queue asks for 150
decisions, founders make three and close the tab.

The fix is batching, and the data to batch on already exists. Done on the
findings screen; the approvals screen still needs it.

---

## Phase 2. Close the gaps that lose the deal

### 2.1 Publishing beyond WordPress

WordPress is about 43% of the web, so more than half of prospects currently get
a copy button, which is the exact failure the product exists to fix. Harden the
three connectors that cover most of the remainder and say plainly on the
connections screen which CMSes cannot be written to.

### 2.2 Drafting without the buyer owning a model key

Drafting is the most impressive feature and it is gated behind a key most
founders do not have. The no-key-of-ours rule is load-bearing and should not be
broken for the free tier. The honest version: on paid plans, drafting runs on
our account with the cost priced in and stated, and bring your own key stays
available and cheaper.

### 2.3 Expectation management

Opinion 001: "this will cause more churn than any missing feature." The
category promises movement in two to four weeks, which is credible for paid ads
and not credible for organic. We should say the true thing and make it a
differentiator: scores move in days, rankings move in three to six months.

`progress.ts` already models six stages with definitions of done. Put that on
the marketing site, not just in the app.

---

## Phase 3. Online presence

### 3.1 The asymmetry to exploit

The convention in this category is a free-tool programme built from toys: a
word counter, a slug generator, a UTM builder, a favicon resizer. Correctly
built as link bait, and honest about it.

We have tools that crawl the prospect's real site, run 90 checks, write the
fixes, and need no signup, no card and no key. That is not a better toy. It is
a different category of top-of-funnel asset, and it is affordable to give away
only because the audit uses no model and no data vendor, so a run costs nothing
to serve.

### 3.2 The content programme, in priority order

**Comparison pages first.** They convert at the bottom of the funnel and they
are what answer engines quote when someone asks "what should I use instead of
X". Each one must include the "when you should buy theirs instead" section,
which is what makes the rest of the page credible.

**Then the wedge essay.** `COMPETITORS.md` contains two facts that decide the
category and are almost unknown outside it: no major AI crawler executes
JavaScript, and a fix you do not own is a fix you are renting. Together they
mean an entire product category sells an AI visibility dashboard and a
script-injected schema fix on the same screen, and the second cannot help the
first.

**Then original research, which is the real moat.** We can crawl at scale for
zero marginal cost because the audit uses no model and no data vendor. Nobody
else in this category can, because their cost per site is a model call or a data
credit. Publish the dataset nobody else can afford to produce, and refresh it
quarterly so it becomes a cited series rather than one post.

**Then the glossary and the programmatic layer.** The constraint is the one in
CLAUDE.md: a listing page with two entries is thin content that fixes nothing.

### 3.3 Be citable, not just rankable

Everything above should be written to the rules `answers.ts` and the AEO checks
enforce: self-contained passages, question-form headings, explicit entities,
citable numbers with sources. Then run `aeo_tracking` against our own prompt set
weekly and publish the result on `/proof`.

---

## Phase 4. Distribution

- **Open source is a channel, not just a licence.** Apache-2.0 already. A
  repository that runs a real SEO audit with no keys is a Show HN, a Product
  Hunt launch and a permanent GitHub referral stream.
- **Run the tool publicly on well-known sites.** Our cost per audit is zero.
- **Go where the buyer already complains.** r/SEO, r/bigseo, Indie Hackers, and
  the SEO corner of X and LinkedIn.
- **The tool directories.** G2, Capterra, and the AEO tool roundups that
  already rank and take submissions.
- **Do not build an affiliate programme yet.** It is premature for a product
  with no retention data.

---

## Phase 5. Sales

### 5.1 The funnel, in the order it should exist

1. **Free audit, no signup.** Already built. Add an email capture that is
   optional and sits after the value, not before it.
2. **Self-serve Starter and Growth.** No call. This is the volume tier, and it
   is the thing competitors gate behind an onboarding call, which is their
   bottleneck.
3. **A paid qualifier for deal-sized accounts.** Charging a small amount filters
   for intent. Ours should be the automated audit plus a human read of it, and
   it should scale better than a founder on a call.
4. **Agency and white label.** This is where the revenue actually is, and it is
   already in the pricing as Scale.

### 5.2 The retention mechanic

An agency retainer survives because something arrives every month. Ours is the
report, and `report.ts` already refuses to substitute crawl movement for
business results. That honesty is the retention mechanic: a report that says
"flat, and here is why" is why a client believes the one that says "up 18%".

### 5.3 What not to do

**Do not chase a full-funnel scope.** Paid ads, social, CRM and email are four
more products, each with a stronger incumbent, and building them would dilute
the one axis where we win outright. If a prospect wants marketing rather than
search, they are somebody else's customer and we should say so.

**Do not tick a capability that is not shipping.** The moment we do, we lose the
only asset a better-funded rival cannot buy.

---

## The sequence, compressed

| When | What | Why it is in this slot |
| --- | --- | --- |
| Week 1 | Fix engine defects. Pass our own checks. Ship `/proof` | Credibility precondition |
| Weeks 2 to 4 | Domain. Provision accounts. Payments. Quota enforcement | Nothing can be sold until something can be bought |
| Weeks 3 to 6 | Headless crawl for paid sites. Batch the approvals screen | The two gaps that make "retainer" honest |
| Weeks 4 to 10 | Comparison pages. The wedge essay. Research refresh | The assets that compound |
| Ongoing | Publishing coverage, drafting on paid plans, expectation management | The gaps that lose deals once deals exist |
| Month 3+ | Agency and white label. Directories. Launch posts | Needs retention data behind it |

## The one-sentence version

The field wins today because it has checkout pages and hundreds of indexed
pages; we win the engine and we failed our own AEO checks, so the order is: be
believable, be buyable, then be everywhere, in that order and not in parallel.
