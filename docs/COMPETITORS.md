# The field, and where the gaps are

Researched September 2026. Every price and claim here came from the vendor's
own site or a dated third-party comparison, and the two load-bearing technical
facts were verified against primary sources rather than taken from a blog.

## Who claims to replace an agency

| Tool | Where | Price | What it really does | Where it breaks |
| --- | --- | --- | --- | --- |
| **Indexable** | US | $15k to $30k a month | Ten named agents, technical fixes as pull requests, GEO included | Enterprise only, and it ships with a "forward-deployed human strategist", so it is a consultancy with software attached |
| **Search Atlas / OTTO** | US | $99 to $999 | The closest direct rival. Finds and fixes on-page, schema, internal links, alt text, through one pixel | Fixes are injected by JavaScript, so AI crawlers never see them, and they revert the day you cancel. Documented cases of broken sitemaps and de-indexed pages |
| **Alli AI** | US | mid hundreds | Same JavaScript injection model, CMS-agnostic | Same invisibility problem. Support complaints are a recurring theme in reviews |
| **Ryze AI** | US | low hundreds | Two-minute setup, autonomous fixes, AI visibility layer | Young, thin technical depth |
| **RankAI** | US | from $49 | Autonomous keywords plus high-velocity content, native Shopify app | Content volume play. Little technical SEO |
| **theStacc** | US | $167 | Content, local and social, auto-published | No technical SEO, no AI visibility |
| **Adaptify** | US | $499 | Strategy plus done-for-you content with human QA | Three times the price of software because half of it is people |

## Who monitors AI answers

| Tool | Where | Price | Notes |
| --- | --- | --- | --- |
| **Profound** | US | $99 and $399, annual only | The category leader. $154m raised, $1bn valuation, 700+ enterprise customers. Has an action layer that generates content |
| **Peec AI** | Berlin | $95 to $495 | Fastest growing challenger, opened New York in 2026. Report only |
| **Scrunch** | Salt Lake City | $300 to $500 | Persona and funnel modelling, serves agent-readable pages at enterprise |
| **Otterly** | Europe | $29 to $489 | The accessible one. Monitoring with recommendations |
| **Athena HQ** | US | free, then $295 | Content optimisation agent, on-page and off-page actions |
| **Semrush AI Visibility** | US | $99 per domain | Bolted onto an existing suite |

## Who publishes content on a schedule

Outrank ($49), SEO Bot ($59), RankYak ($59), Emplibot ($79), PilotScribe. All
do the same thing: generate articles and push them to a CMS. None does
technical SEO, none does AI visibility, and the common complaint is content
that reads like every other tool's content, with fabricated statistics found
in unedited drafts during client audits.

## The two facts that decide the category

**No major AI crawler executes JavaScript.** Vercel's crawler study and
subsequent 2026 measurements agree: GPTBot, ClaudeBot, PerplexityBot,
OAI-SearchBot, Meta-ExternalAgent and Bytespider fetch raw HTML and never run
client-side code. GPTBot downloads JavaScript on about 11.5% of requests and
executes none of it; ClaudeBot downloads it on about 23.8% and executes none.
Onely's February 2026 analysis found 42% of JavaScript-rendered content never
reaches AI systems at all. Google's Gemini is the exception because it rides
Googlebot's renderer, and Applebot renders too.

The consequence is unavoidable and nobody in the pixel category says it out
loud: **every fix those tools apply is invisible to the engines their own
marketing sells you on.** They will show you an AI visibility dashboard and a
schema auto-fix on the same screen, and the second cannot help the first.

**A fix you do not own is a fix you are renting.** Search Atlas's own
documentation confirms that schema, meta changes and redirects revert when the
pixel is removed. Content and Business Profile updates persist because those
live in systems the customer owns. That is the tell: the parts written into
somebody else's system survive, and the parts injected do not.

## What we do about it

| Their weakness | What this repository does instead |
| --- | --- |
| Fixes injected by script, invisible to AI crawlers | Writes into the CMS through its own API, so the change is in the served HTML |
| Fixes revert on cancellation | The change is in your CMS. Cancel and it stays. There is nothing to remove |
| No undo | Every publish reads the previous value first and stores it. Reversing runs the same route backwards |
| Monitoring sold as a subscription | Answer visibility runs on the tenant's own model key, at cost |
| Agency replacement priced at $15k to $30k | The audit is free and needs no account. Nothing here requires a model key except drafting |
| Fabricated statistics in generated content | A claim the brief did not supply is marked unverified and cannot be published until a person confirms it |
| Nobody detects the injection problem | Three checks: content that needs JavaScript, meta set by script, and a named list of the injectors doing it |
| Competitor data is a resold traffic estimate | The same crawl and the same checks, run against their public site, on the same day |

Two things we do not have yet, stated rather than hidden: backlink data needs a
paid source, and Business Profile posting needs Google's own access approval.
Both are named on the connections screen with what they unlock.
