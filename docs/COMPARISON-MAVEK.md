# Mavek against this platform

Research date: 19 September 2026. Every claim about Mavek below came from
mavek.ai, from app.mavek.ai, from Mavek's own robots.txt and sitemap, or from
a named third party. Every claim about this repository was checked by running
it. Where a number could not be verified it is marked as unverified rather
than repeated.

This is a competitor teardown, not a sales page. It is filed next to
`COMPETITORS.md`, which covers the field; this covers one company in depth
because the comparison was asked for directly.

---

## 0. The short version

The two products are not the same shape, and most of the argument follows from
that.

**Mavek is a marketing department sold as software.** Six named agents cover
paid ads, SEO, content, social, outreach and analytics. Search is one of six
lanes. There is a company behind it, a live application, a billing system, an
onboarding call and a founder answering the phone.

**This platform is a search growth engine.** It does one lane and goes several
layers deeper into it: 90 checks, generated fixes as shippable artefacts,
answer visibility measured on the tenant's own key, a link programme with
verification, and a rule that a number with nothing behind it does not render
as a number.

On search, answer engines and measurement honesty, this platform is better and
the margin is not close. On being a thing a founder can buy on a Tuesday and
have running by Thursday, Mavek is ahead and the margin is also not close. The
full verdict is in section 8.

---

## 1. What Mavek actually is

### Company

| | |
| --- | --- |
| Product | Mavek, at mavek.ai. Application at app.mavek.ai |
| Founded | 2026, per the Organization JSON-LD on every page |
| Founder | Jeet Bhanushali, sole named founder. Nine years in SEO, agency side in Mumbai, then growth for brands across the Middle East, US, Canada and India |
| Positioning line | "One person. Unlimited output." / "While you sleep, Mavek executes." |
| Public launch | 1 March 2026, per the changelog |
| Last changelog entry | 2 April 2026, v1.4. Five and a half months stale at the date of this research |
| Contact | donna@mavek.ai, which is also the name of one of the agents |
| Billing | USD, monthly, through Razorpay. No annual billing |
| Social proof claimed | 5.0 on G2, 5.0 on Capterra |

The G2 and Capterra pages are linked from the site's `sameAs` array. Both
returned 403 to an unauthenticated fetch and no review corpus for Mavek
surfaced in search, so the 5.0 figures are **unverified**. A 5.0 with an
undisclosed review count is a weak signal either way.

The founder also sells consulting directly on Topmate: 266 bookings, a 90-day
SEO and AEO plan at about 3,499 rupees, a live technical audit at about 4,999
rupees. That matters for reading the company. Mavek is a solo-founder,
services-adjacent product, not a funded platform team.

### The six agents

| Agent | Lane | What the site says it does |
| --- | --- | --- |
| Donna | Strategy and brief | ICP work, positioning, messaging pillars, pricing strategy, launch plans |
| Eva | Paid ads | Google search, shopping, PMax, Meta. Campaign build, creative variants, budget shifts, ROAS optimisation |
| Carrie | Content, copy and SEO | Keyword research, technical audit, content calendar, drafting, on-page, programmatic SEO, outreach drafting, localisation |
| Sherlock | Analytics, data and CRO | GA4 instrumentation, server-side events, attribution, churn, funnel rebuilds |
| Emily | Social media | Calendar, per-platform creative, trend watching, community |
| Ari | Lead gen and outreach | Lead magnets, cold email, sequences, sales enablement, calendar booking |

Skill count is given as "35+" on the agents page and "39" on the pricing page.
The live application's skills screen groups them into eight categories:
Content and Copywriting, SEO and Organic Search, Paid Advertising, Email and
Outreach, Conversion Rate Optimisation, Growth and Strategy, Customer
Intelligence, Revenue Operations.

### The search half, in detail

This is the part that overlaps with us, so it gets read closely.

**AI SEO (`/ai-seo/`).** Seven capabilities claimed as shipping: technical
crawls and page audits, keyword expansion and clustering, competitor keyword
gaps, content briefs, article drafting, WordPress publishing, daily rank
tracking across ten markets.

**Rank tracker (`/rank-tracker/`).** Google top 100, nightly snapshot, refresh
on demand, records position plus the ranking URL, desktop and mobile as
separate lines, competitor domains on the same schedule, a movers report
callable from chat. Stated limits: no Bing, no city or map-pack tracking, no
SERP feature ownership, stops at position 100. Markets are given as **six**
here (US, UK, India, Canada, Australia, Germany) against **ten** on the AI SEO
page and the Semrush comparison page.

**AI visibility (`/ai-visibility/`).** Five signals per answer per engine:
named or not, position in a ranked list, sentiment framing, which competitors
appeared instead, what the engine cited. Five engines (ChatGPT, Claude,
Perplexity, Gemini, Google AI Overviews) across ten markets. **This is in
private beta and the page says so plainly: "The tracker is in private beta and
opens with the Mavek launch."** The CTA on that page is "Get early access",
not "Start trial".

**SEO and AEO service (`/services/seo-aeo/`).** Keyword and entity research,
answer engine optimisation, technical audits, content clusters, on-page,
SERP and LLM monitoring.

**The $9 live audit (`/seo-audit/`).** Thirty minutes, live on a call, run
personally by the founder, paid, ending in a PDF roadmap. Explicitly aimed at
indie hackers and founders with a live revenue-generating product.

### The live application

app.mavek.ai is a real deployment: a static HTML and vanilla-JS front end
against a FastAPI backend at `/api/v1`, JWT access and refresh tokens held in
`localStorage`. The pages that exist are:

```
login · register · onboarding · dashboard · campaigns · chat
credentials · reports · settings · skills
```

Everything else 404s. There is no SEO screen, no rank tracker screen, no
keyword screen, no AI visibility screen, no approvals screen and no content
screen in the shipped application. The dashboard's own modules are
advertising-shaped throughout: spend by channel, campaign status, objective
mix, budget versus spend, clicks and impressions, integration health.

The onboarding copy reads: "Brief Mavek AI on your goal, Claude will draft
strategy, audience, creative, and budget." So the platform is built on
Anthropic's models and does not hide it.

Two smaller observations from the shipped code. The registration page carries
the string "Google sign-up not configured. Add GOOGLE_OAUTH_CLIENT_ID to .env
and restart", which is a developer fallback that reached production. And the
API client's own comments describe debugging a 428 gate that "silently fell
back to onboarding.html for every gate". Neither is fatal. Both are the
fingerprints of a product shipped fast by a very small team.

---

## 2. Mavek's pricing

| Plan | Price | Credits | Notes |
| --- | --- | --- | --- |
| Trial | Free, 14 days | 10,000 | No card. Every capability unlocked |
| Starter | $125/mo | 200,000 | Solopreneurs, 1 to 2 channels |
| Growth | $499/mo | 1,000,000 | "Most popular". 3 to 5 channels, advanced attribution |
| Scale | $1,299/mo | 3,000,000 | Multi-brand, custom integrations |
| Enterprise | $2,500+/mo | Custom | Unlimited brands, white label, dedicated AM, SLA |

The model is credit-metered, not seat- or site-metered. Every capability ships
in every tier including the free trial; only the credit ceiling moves. That is
a clean, well-argued pricing page, and the credits section does the rare thing
of telling you roughly what each allotment buys.

The prices are not consistent across the site. The pricing page says
$125/$499/$1,299/$2,500+. The Semrush comparison page says "$499, $1,299, or
$2,000 a month". The Profound comparison page says the same three numbers. The
rank tracker page says plans "start at $499 per month", which contradicts the
$125 Starter tier three clicks away.

Their cost anchor is an in-house bench at "$3,600+/mo" broken into five roles.
It is a defensible anchor and a conservative one, which is the right way to
build that table.

---

## 3. Where Mavek's marketing is excellent, and where it is not

This section matters more than a feature grid, because it is the clearest
read on how the company thinks.

### The good, and it is genuinely good

Mavek's **search pages are among the most honest marketing pages in this
category**. `/ai-seo/` carries a section titled "Four things AI SEO cannot do
for you", which states that AI cannot manufacture authority, cannot know your
business, cannot originate proof, and should not run unsupervised. It opens
that section with: "Any vendor who skips this section is selling you the demo,
not the outcome."

`/rank-tracker/` carries "What the rank tracker does not do" and names four
real limits before you buy. `/compare/mavek-vs-profound/` opens by conceding
that Profound is better at Profound's job and lists four cases where you should
buy the competitor instead. `/compare/mavek-vs-semrush/` does the same.

That is the exact posture this repository claims as its moat, executed well, by
a competitor, on a live site. It deserves to be said plainly rather than
skated past.

Their robots.txt is also a small masterclass: every major AI crawler named and
allowed explicitly, only `/api/` disallowed, with a comment explaining why.
They publish an llms.txt. They practise the AEO they sell.

### The problem

The honesty lives on the pages an SEO wrote. It does not survive the pages the
marketing wrote, and the two contradict each other.

**Integration status.** The `/integrations/` page marks HubSpot, Apollo.io,
Ahrefs and LinkedIn as **"Coming soon"**, with HubSpot spelled out as "On the
roadmap, not live yet". Meanwhile:

- The homepage: "Mavek connects directly to Google Ads, Meta, GA4, Search
  Console, Apollo.io, HubSpot, Ahrefs, and the rest of your stack."
- `/how-it-works/`, `/for-brands/` and `/for-agencies/`: the same sentence.
- The homepage FAQ: "Mavek integrates with Google Ads, Meta Ads, HubSpot,
  Apollo.io, Google Analytics, Google Search Console, and LinkedIn. All
  integrations are one-click OAuth."
- The pricing FAQ, under the question "Which integrations are live today?":
  "Google Ads, Meta Ads, LinkedIn, GA4, Search Console, Gmail, Google Calendar,
  Apollo, WhatsApp Business, WordPress, DataForSEO, and PageSpeed Insights."

Four of those are marked not-live on the company's own integrations page. The
pricing FAQ question is literally "live today" and the answer includes them.
The homepage also states the product "generates leads via Apollo, syncs with
HubSpot" as present-tense fact.

**Credential handling.** `/integrations/` says "We never store your
credentials". The pricing page says "Every credential is encrypted at rest" and
"Credentials are encrypted". Both cannot be true. Encrypting at rest is the
correct and normal answer; claiming you never store them reads as a security
claim the product does not make elsewhere.

**Markets.** Six on the rank tracker page, ten on two other pages.

**Skills.** 35+ on one page, 39 on another.

**The AI visibility beta.** The dedicated page says private beta. The pricing
page's comparison grid shows "Optimize for ChatGPT, Claude, Perplexity,
Gemini", "Citation and mention monitoring" and "Answer-engine content + schema
markup" as ticked on all five tiers including the free trial, and the FAQ
answers "Is AEO / GEO (AI SEO) included in every plan?" with "Yes ... including
citation monitoring". A feature in private beta appearing as a shipped tick on
a pricing grid is the single most expensive claim on the site, because it is
the one a buyer signs up for.

**Agency capacity claim.** `/for-agencies/` states "a 12-person agency went
from 8 clients to 22 using Mavek". No named agency, no date, no case study
link. The site's footer links a "Case Studies" entry that is not in the
sitemap.

**One answer that is simply wrong on its own terms.** The `/for-agencies/` FAQ
asks "Will my team still be needed with Mavek?" and answers "**No.** Mavek
augments your team, never sidelines it." The yes/no marker contradicts the
sentence after it. That is an editing failure, not a lie, but it is on a page
selling to agency owners about their staff.

None of this makes Mavek a bad product. It makes it a product whose marketing
surface has outrun its engineering surface, which is the most common failure
mode in this category and the one their own `/ai-seo/` page warns about.

---

## 4. What this platform is

### Stated inventory, and what actually verified

Run on 19 September 2026 on a clean checkout:

```
$ seoos check
tools: 60 · agents: 53 · missions: 8 · Everything validates.

$ pytest -q
141 passed in 19.02s

$ npm run test:engine
# tests 57 · pass 57 · fail 0
```

| Claimed | Verified | Note |
| --- | --- | --- |
| 53 agents | 53 | Markdown specs in `agents/roster/` |
| 8 missions | 8 | YAML in `missions/workflows/` |
| 60 tools | 60 | Registry-gated, each with a risk level |
| 21 connectors | 21 | Behind one contract, with a capability matrix |
| 71 checks | **no** | TypeScript catalogue has **90**, Python has **74**, 68 shared. README and CLAUDE.md are stale |
| 43 tables | 43 | |
| 141 tests | 141 Python, plus 57 engine | README says "141 tests plus the engine suite", which is right |

The check-count drift is a documentation bug, not a capability bug, and it errs
downward. Still worth fixing, because the numbers are in the README banner.

### The audit, run for real

Against `iana.org`, no API keys, no connectors, no model provider:

```
15 pages · 90 findings · health 75.0 · 75 seconds · $0.0000
```

Against `mavek.ai`, 40 pages:

```
40 pages · 120 findings · health 80.3 · aeo 62.6 · 15 seconds · $0.0000
```

Findings on mavek.ai broke down as:

| Severity | Code | Count |
| --- | --- | --- |
| high | schema_contradicts_page | 40 |
| medium | image_alt_missing | 40 |
| medium | no_author_attribution | 16 |
| medium | no_direct_answer | 3 |
| medium | no_citable_facts | 2 |
| medium | h1_missing | 1 |
| medium | orphan_page | 1 |
| low | title_too_long | 12 |
| low | title_too_short | 2 |
| low | image_legacy_format | 2 |
| low | heading_hierarchy_broken | 1 |

**One of those is our bug, and it is a bad one.** `schema_contradicts_page`
fired on 40 of 40 pages at high severity. The cause is in
`analysis/checks/schema.py`: it flags any schema `name`, `headline` or
`description` longer than 25 characters whose first 60 characters do not appear
in the visible page text. Mavek's site-wide `Organization` block carries a
description that is not meant to be body copy, which is correct and normal
usage, so the check fires on every page that carries the block. That is a
false positive at high severity, repeated site-wide, which is precisely the
failure mode invariant 3 exists to prevent.

It is also an engine disagreement. The TypeScript side only emits
`schema_contradicts_page` for FAQPage markup on a page with no visible
questions, which is narrow and correct. CLAUDE.md says a code present in both
engines must never disagree. This one does. Both are logged in section 9.

Reporting a defect in our own tool inside a document arguing our tool is better
is the point. A comparison that only finds faults on one side is a brochure.

### The capability surface

**90 checks** across twelve categories: technical 17, content 17, AEO 11,
local 8, performance 7, schema 6, offpage 6, UX 4, compliance 4, analytics 4,
international 3, ecommerce 3. Six are critical severity, 28 high.

**Fixes, not findings.** `fixes.ts` generates seven artefact kinds: `meta`,
`html`, `jsonld`, `file`, `redirect`, `link_plan`, `copy`. Titles, meta
descriptions, H1s, canonicals, lang attributes, viewport, Open Graph, full
JSON-LD blocks and JSON-LD patches, sitemaps, cleaned sitemaps, robots.txt,
llms.txt, alt text, direct-answer paragraphs, heading rewrites, internal link
plans, repointed links, redirects, image dimensions, lazy loading, affiliate
disclosures, NAP blocks and location pages. `fixIsComplete()` rejects any fix
with an empty payload or a `REPLACE:` marker before it can reach the queue.

**Answer visibility that is measurement, not monitoring.** `answers.ts` builds
five prompt shapes (category, comparison, problem, local, brand) derived from
the crawl rather than typed by the user, runs them on the tenant's own model
key, and records named separately from cited, with rival appearances and the
prompts you lost. The header comment states the reasoning: a dozen platforms
charge $29 to $500 a month to run model calls and resell them, and the
expensive part is the reselling.

**Links with two risk numbers.** `link-risk.ts` separates scheme risk from
waste risk, because a link that does nothing and a link that could earn a
manual action need opposite responses. A disavow file is refused unless a
manual action is actually reported. `mentions.ts` weights unlinked brand
mentions above links, on the Ahrefs 2026 finding that mentions correlate with
AI Overview visibility at 0.664 against 0.218 for backlinks.

**Outreach that refuses to be a template.** `outreach.ts` returns `null`
rather than an email when the proof is shorter than a sentence or the sender is
incomplete. Nothing in the path sends: `composeUrl()` opens the user's own mail
client with the fields filled.

**Measured or not measured.** `score.ts` marks Authority unmeasured without
link data and Experience unmeasured without a timing run, and carries the
reason and the fix with the flag. `compareRuns()` drops any score whose
`measured` flag is false from a report rather than filling the space.

**A programme, not a run.** `progress.ts` models six stages, from "Can it be
found" to "Keep it running", each with a definition of done, and refuses to
score the competitive stage without Search Console rather than guessing.
`schedule.ts` carries `runsHeadless` per job and prints on screen that a
scheduled crawl needs a browser tab, because the public deployment runs the
audit client side.

### Pricing

| Plan | Price | What it is |
| --- | --- | --- |
| Free | £0 | Full check catalogue, 40 pages per run, every fix generated, AI crawler check, content gaps and three briefs, JSON export |
| Starter | £79/site/mo | 250 pages, weekly scheduled runs, run history, GSC and analytics, approval queue, publishing to WordPress, Shopify, Webflow or a webhook |
| Growth | £249/site/mo | 2,000 pages, content production with quality gates, local cycle, link prospecting and outreach from your own domain, AI answer tracking, monthly narrative report |
| Scale | Custom | Unlimited sites and seats, white label, self-hosted, priority connector work |

Per site, per month. The audit is free forever and needs no account.

---

## 5. Head to head

### On search, answer engines and measurement

| | Mavek | This platform |
| --- | --- | --- |
| Technical checks | Not enumerated publicly. Screens for it are not in the shipped app | 90 in TS, 74 in Python, published with impact, effort, confidence and the fix |
| Fixes | Drafted, staged for approval, published to WordPress | Generated as shippable artefacts in seven formats, incomplete ones blocked from the queue |
| Fix persistence | In your CMS, so it persists | In your CMS, so it persists. Every publish stores the previous value first, so reversal runs the same route backwards |
| Rank tracking | Google top 100, 6 markets, desktop and mobile, nightly, competitors | Via DataForSEO or Serper when connected. Geo-grid for local |
| AI visibility | 5 engines, 10 markets, 5 signals per answer. **Private beta** | Live. Prompts derived from the crawl, named and cited tracked separately, rival share, lost prompts, run on the tenant's own key at cost |
| AI crawler detection | Checks crawler access | Checks access, plus content that only exists after JavaScript, meta injected by script, body not present in served HTML, and a named list of the SEO tools doing the injecting |
| Measurement honesty | Not addressed | Scores carry a `measured` flag with a reason and a fix; unmeasured scores are dropped from reports |
| Backlinks | Ahrefs integration marked coming soon | Two-number risk model, verification that reads `rel` from HTML rather than text, mentions weighted above links, disavow refused without a manual action |
| Outreach | Cold email sent from Gmail, 50/hr, 500/day per mailbox | Drafted only, sent through the tenant's own SMTP or mail client, refuses templates and placeholders |
| Local | Not a product area | 8 checks, GBP posting, review replies gated by rating, citations, geo-grid |
| Content safety | "No AI slop" as a stated belief | Fact ledger; a claim the brief did not supply is marked unverified and blocked before a human sees it |
| Schema | Generated and applied | Generated from what the page contains, required properties checked, `@id` resolved before complaining, invalid blocks rewritten |
| Runs with nothing connected | Requires an account and OAuth | Full audit, all checks, all fixes, no account, no card, no key |

### On being a product you can buy

| | Mavek | This platform |
| --- | --- | --- |
| Live application | Yes, app.mavek.ai, 10 screens | Yes, a Cloudflare Worker, public, no signup |
| Billing | Razorpay, five tiers, credits | None. Prices are published, nothing charges |
| Accounts | Email and Google, JWT sessions | Optional. D1 and Google OAuth, additive by design |
| Company | Registered, founder-led, sales calls, affiliate programme | None |
| Human layer | Real marketers review strategy on every plan | None. Software only |
| Onboarding | Call, then one-click OAuth, 48 hours to first activity | Type a URL |
| Content marketing | 141 pages: 37 blog posts, 19 free tools, 19 glossary entries, 10 comparison pages, 4 industries | 8 marketing routes |
| Channels covered | Paid ads, SEO, content, social, email, outreach, CRM, analytics | Search, answer engines, local, links |
| Age | Launched March 2026 | First commit 14 September 2026. Five days old |

That last row is the one that reframes everything above it.

---

## 6. Product marketing, side by side

### Unique selling proposition

**Mavek.** "One person does the work of ten." The USP is *scope collapse*: one
subscription replaces five hires across every channel, with human approval
gates so the founder keeps control and real marketers behind the software so it
is not only a model. The strongest single line on the site is the cost table:
five roles at $3,600+ a month against $499.

**This platform.** "It does the work, or it says plainly that it cannot." The
USP is *verifiable execution in search*: every number traces to a crawl that
happened, unmeasurable things are labelled rather than invented, fixes land in
systems the client owns so they survive cancellation, and the audit costs
nothing and needs no account. The second USP, underused, is that nobody else
detects that a competitor's JavaScript-injected fixes are invisible to the AI
crawlers those same competitors sell visibility against.

### Limitations, stated honestly for both

**Mavek**

1. AI visibility, the headline AEO capability, is in private beta while the
   pricing grid shows it shipping on every tier.
2. Four of the advertised integrations are marked not live on their own
   integrations page and live everywhere else.
3. The shipped application has no SEO, keyword, rank or visibility screen. The
   SEO work appears to run through chat and reports rather than a product
   surface.
4. Rank tracking stops at Google, position 100, country level. No Bing, no
   local pack, no SERP features, stated honestly on the page.
5. Credit metering makes cost unpredictable for a founder who cannot estimate
   how many credits a month of work consumes.
6. Chat history is kept 7 days, artefacts 30 days. For a system whose pitch is
   a memory layer that compounds, that is a short window and it is on the
   pricing page.
7. Single-founder concentration risk, a changelog stale since April, and social
   proof that cannot be verified.
8. No self-hosting, no SOC 2, no SSO mentioned below Enterprise. Their own
   Profound page concedes procurement-grade buyers should go elsewhere.

**This platform**

1. It is five days old. There is no company, no billing and no support.
2. `schema_contradicts_page` false-positives site-wide on a legitimate
   Organization description, at high severity. Found by running our own tool on
   Mavek's site during this research.
3. The Python engine has no `measured` flag at all, so the CLI printed
   "authority 100.0" for a site with no backlink data connected. The
   TypeScript engine handles this correctly. The invariant holds on the public
   deployment and fails on the server installation.
4. Check catalogues have drifted: 90 in TS, 74 in Python, 22 codes in TS only,
   6 in Python only, and the README says 71.
5. The public deployment runs the audit in the browser, so a scheduled crawl
   needs a tab open. The product says so on screen, which is the right handling,
   but it is still a limitation Mavek does not have.
6. Publishing beyond WordPress is thinner in practice than the connector list
   suggests, and a prospect not on a supported CMS gets a copy button.
7. Drafting needs the tenant's own model key, which most founders do not have.
8. Zero brand, zero distribution, zero customers. Mavek has 141 indexed pages
   and a working funnel. We have a workers.dev subdomain.
9. Nothing here touches paid media, social, CRM or email marketing. For a buyer
   who wants marketing rather than search, we are not a candidate at all.

### User journey

**Mavek.** Blog post or free tool, or the $9 audit. Then a 14-day trial with no
card, or a waitlist form, or a booked call with the founder. Onboarding call to
capture brand guidelines, ICP and goals. One-click OAuth into Google Ads, Meta
and GA4. Agents produce work into a review queue. The user approves. Campaigns
launch, content publishes, reports arrive Monday and on the first of the month.
First campaign activity promised inside 48 hours, meaningful movement in two to
four weeks.

The friction points are the onboarding call, which is a human bottleneck, and
the credit ceiling, which is a cost cliff the user cannot forecast on day one.

**This platform.** Type a URL. A crawl runs, checks run, scores render, fixes
appear written. No account, no card, nothing to connect. Then a fork: take the
fixes and leave, or connect Search Console and Analytics so the keywords are
real, the striking-distance list is real and the reporting is in revenue,
connect a CMS so approved changes publish themselves, add a model key so
drafting works. The
programme screen tells you which of six stages you are in and what is blocking
the next.

The friction point is the same one the September opinion note named: the
connection step, where a founder meets a Google consent screen. And the
approval queue, where a real site produces 150 findings and a founder makes
three decisions and closes the tab.

### Marketing pitch

**Mavek.** Emotional, aspirational, founder-to-founder. "While you sleep,
Mavek executes." "Log off at golden hour." Named agents with personalities is a
strong device: Donna, Eva, Carrie, Sherlock, Emily, Ari are easier to hold in
your head than "the strategy module". The comparison table against point tools,
DIY, hiring and copilots is well built. The four-ingredient frame (AI models,
expert skills, your data, human team) is the clearest thing on the site.

**This platform.** Structural, evidential, operator-to-operator. "SEO OS: the
search agency, as software." "The crawl, and then the repair." "Every number on
every screen came from a real crawl of your real site." The pitch is built
around refusals: what it will not publish, what it will not score, what it will
not send. That is a narrower emotional register and a much stronger trust
position. It converts sceptics and bores everyone else.

### Target audience

| | Mavek | This platform |
| --- | --- | --- |
| Primary | Founders and solo marketers at SMBs and SaaS who would otherwise hire | Founders and in-house marketers who already know search matters |
| Secondary | Agencies wanting an invisible execution layer, white-labelled | Agencies wanting a per-site engine they can white label, and technical buyers who will self-host |
| Geography | US-first, with explicit UAE, India and Dubai pages | Not geographically targeted. UK pricing in pounds |
| Buyer sophistication | Low to medium. "If you can write a brief, you can use Mavek" | Medium to high. The product rewards someone who knows what a canonical is |
| Who it is wrong for | Anyone needing enterprise AEO analytics depth, SOC 2, or a backlink index | Anyone who wants ads, social or CRM, or who wants a person to call |

### Go to market

**Mavek** is running the textbook SEO-led playbook and running it competently:
19 free tools as top-of-funnel magnets, 10 competitor comparison pages
(including against Profound and Semrush, which is correct for AI-era search),
19 glossary pages for entity coverage, 4 industry pages, 4 use-case pages, a
city page for Dubai, an affiliate programme, a waitlist with founder pricing, a
lead magnet pair behind an email gate, and a $9 audit that qualifies buyers by
making them pay something. Their robots.txt and llms.txt say they take AEO
seriously for themselves. The one gap is that the founder is the delivery
mechanism for the $9 audit, which does not scale past roughly 40 calls a month.

**This platform** has no go-to-market. The asset that would work is the one
already built: a free, no-signup audit that produces written fixes in ten
minutes. That is a better top-of-funnel magnet than any of Mavek's 19 tools,
because it does real work on the visitor's real site. It is sitting on a
workers.dev subdomain with no distribution behind it.

---

## 7. What each could take from the other

**We should take from Mavek:** named agents as a comprehension device, a
comparison-page programme, the cost-anchor table, the free-tools funnel, the
paid-qualifier audit, and above all a working billing and onboarding path.
Their `/ai-seo/` limits section is a page we should have written.

**They should take from us:** the `measured` flag, so a score with nothing
behind it does not render a number. The two-number link risk model. Fix
artefacts written to the CMS with the previous value stored for reversal. And
the integrations page discipline of saying "not live yet" in one place and
meaning it everywhere else.

---

## 8. The verdict

**They are not competing for the same purchase, and pretending otherwise is
how you get the answer wrong.**

**On the axis this repository exists to win, this platform is the better tool,
clearly.** More checks, published with their methodology. Fixes as artefacts
rather than suggestions. AI answer visibility that is live rather than in
private beta, derived from the crawl rather than typed in, and run at the
tenant's cost rather than resold. Detection of the JavaScript-injection problem
that nobody else in the category names. A link programme with a risk model that
distinguishes waste from danger. A local module Mavek does not have. And a
measurement-honesty discipline that is enforced in code, not asserted in copy.
Against Mavek's search half specifically, it is not close.

**On the axis a buyer actually buys, Mavek is the better product today.** It
exists as a company. It takes money. It covers paid media, social and CRM,
which we do not touch at all, so for any founder whose problem is "marketing"
rather than "search", we are not on the list. It has a human layer, which is
the thing our own September opinion note identified as 70% of an agency's
value. It has distribution, a funnel and five months of operating history. A
founder can buy it on Tuesday and see campaign activity by Thursday. They
cannot do that with us because there is nothing to buy.

**The honest summary in one line:** this is a better engine inside a product
that does not exist yet, against a real product with a thinner engine and a
marketing surface that has written cheques its integrations page refuses to
cash.

**What would change the verdict.** For us: billing, a hosted crawl so the
schedule runs without a tab, the false positive in section 9 fixed, and any
distribution at all. For them: shipping the AI visibility tracker out of beta,
reconciling the integrations claims across the site, and building a product
surface for the SEO half instead of leaving it in chat.

**The recommendation this document ends on** is the same one Opinion 001 made
three days ago and it still holds. Do not sell this as an agency replacement
yet. Sell the free audit, which is better than anything Mavek has at the top of
its funnel, and grow into the retainer claim once the programme runs unattended.
The difference between the two companies right now is not the quality of the
engine. It is that one of them has a checkout page.

---

## 9. Defects found in this repository while writing this

Logged rather than fixed, because this task was research. Each is real and
reproducible.

1. **`schema_contradicts_page` false positive, high severity, site-wide.**
   `analysis/checks/schema.py` flags any schema `name`, `headline` or
   `description` over 25 characters whose first 60 characters are absent from
   the visible page. A site-wide `Organization` description is legitimate and
   is not body copy, so the check fires on every page carrying the block. It
   produced 40 of 40 pages on mavek.ai. Breaks invariant 3.

2. **The two engines disagree on `schema_contradicts_page`.** TypeScript emits
   it only for FAQPage markup with no visible questions. Python emits it on the
   string-match rule above. CLAUDE.md: "A code that exists in both must never
   disagree."

3. **The Python engine has no `measured` flag.** `ScoreBreakdown` in
   `analysis/scoring.py` carries score, components, penalties, counts and
   top_issues, and nothing else. `seoos demo` printed "authority 100.0" for a
   site with no link data connected. The TypeScript `score.ts` handles this
   correctly. Invariant 2 holds on the Worker and fails on the server install.

4. **Check counts are stale in the README banner and CLAUDE.md.** Both say 71.
   Actual: 90 TypeScript, 74 Python, 68 shared, 22 TypeScript-only, 6
   Python-only.
