# Okara against this platform

Research date: 20 September 2026. Every claim about Okara came from okara.ai,
from its own `llms.txt`, its docs (fetched as Markdown from the docs site), its
sitemap, or a named third party. Every number about this platform was produced
by running it. Anything that could not be verified is marked unverified rather
than repeated.

Okara is a materially stronger competitor than Mavek, and the comparison is
closer to home. Where `COMPARISON-MAVEK.md` describes a marketing department
that happens to include search, this describes a company building much of what
this repository builds, shipping it, and marketing it well.

---

## 0. The short version

**Okara is an "AI CMO": ten agents covering SEO, GEO, content, Reddit, X,
LinkedIn, Hacker News, influencer, UGC video and code.** Search is one lane of
ten, but unlike Mavek the search lane is serious: daily audits, GEO tracking
across four engines, CMS write-back for WordPress and Webflow, and a coding
agent that opens pull requests against your repository.

That last one matters more than anything else in this document. **Okara ships
technical SEO fixes as GitHub pull requests.** That is the same "a fix you own
beats a fix you rent" position this platform is built on, held by a competitor
with 498 indexed pages and a claimed 100,000 users.

Three things still separate the two products, and they are not marketing
differences:

1. **Throughput.** Okara delivers **two fixes per day**. This platform
   generates every fix it can from a single crawl.
2. **Coverage.** Okara's auto-apply table covers seven fix types across two
   CMSes. This platform's catalogue is 90 checks with generated artefacts in
   seven formats.
3. **Measurement discipline.** Okara's GEO score blends measured and modelled
   inputs into one number. This platform refuses to render a score whose main
   input is missing.

Where Okara is clearly ahead: content volume, distribution breadth, social
proof, and the fact that you can buy it today.

---

## 1. The company

| | |
| --- | --- |
| Product | Okara, "the AI CMO", at okara.ai |
| Founded | 2025, per third-party coverage |
| Base | Singapore, distributed team |
| Founder | Fatima Rizwan, previously founder of TechJuice |
| Funding | Undisclosed. Described as bootstrapped and revenue-funded via a Founding User Program |
| Stack | Next.js on Vercel, Stripe, PostHog, Microsoft Clarity, ConvertKit |
| Claimed scale | "Used by 100,000+ users" |
| Indexed pages | 498 in the sitemap |

The "100,000+ users" figure and the customer logo wall (Kong, VWO, UpGuard,
Razer, Sticker Mule, Chili Piper, Seeking Alpha, Photoroom and about twenty
more) are **unverified**. The wall is captioned "trusted by teams at", which is
a softer claim than "customers of", and it is worth reading it as written.

Three named case studies do carry numbers: Lovie (+56% average position, +73%
CTR), Unlayer (171,600 views in 24 hours, 26 creators), HeMed (+56% GA4
sessions, +27% impressions). Those are attributed to named founders.

**One architectural observation.** The site's Content Security Policy permits
connections to four public CORS proxies: `api.codetabs.com`, `corsproxy.io`,
`api.allorigins.win` and `thingproxy.freeboard.io`. That is consistent with
fetching third-party pages from the browser through shared public
infrastructure. It is an observation from a public header, not a conclusion
about how any particular feature works, and it is recorded because the same job
here goes through our own Worker with SSRF validation on every hop.

---

## 2. The product

### Ten agents, one handoff

The model is three steps, and the first one is the interesting part.

**Step 1, Research.** Okara generates five strategy documents from the site:
`product-information.md`, `marketing-strategy.md`, `competitor-analysis.md`,
`brand-voice.md`, `content-strategy.md`. Every agent reads these before it
writes anything.

That is a good design and worth saying so. A shared, inspectable strategy
artefact is how you stop ten agents drifting off-message, and it is more honest
than a hidden prompt because the customer can read it.

**Step 2, Execution.** SEO, GEO, Writer, Reddit, X, LinkedIn, Hacker News,
Influencer, UGC Video, Coding. A Link Broker agent is marked "Soon".

**Step 3, Publish.** WordPress, Webflow, Framer, Wix, Sanity, Search Console,
Analytics, GitHub, LinkedIn, X, WhatsApp, Telegram. TikTok, Instagram and Slack
are marked "Soon", which is stated on the page rather than hidden.

### The search half, in detail

**SEO agent.** Daily full audit. SEO score out of 100, Core Web Vitals (FCP,
LCP, CLS, TBT, mobile and desktop separately), meta quality, site files
(`robots.txt`, `sitemap.xml`, `llms.txt`), backlink profile and domain
authority, keyword position tracking, and a prioritised issues list.

Free plan audits **the homepage only**. Paid audits every sub-page daily.

**GEO agent.** Paid only. Tracks **up to 15 prompts** across ChatGPT,
Perplexity, Claude and Gemini. Reports a GEO score, per-platform breakdown,
brand sentiment, competitor share of voice, top citation sources, and "Top
Prompts": buyer-intent questions where the brand should be cited and is not.

**Fix delivery, which is the throughput ceiling.** Both agents deliver **two
fixes per day**, with copy-paste snippets. The marketing is explicit and frames
it as a feature: "not a 200-item issues list you'll never work through." That
is a real insight about behaviour, and it is the same problem Opinion 001 named
here.

**What can be applied automatically:**

| Fix | WordPress | Webflow |
| --- | :---: | :---: |
| Meta description | yes | yes |
| Title tag | yes | yes |
| Open Graph tags | yes | yes |
| Twitter Card tags | yes | yes |
| Image alt text | yes | yes |
| H1 tag | yes | no |
| Canonical | yes | no |

Anything structural is "flagged as manual". For code-level changes, the Coding
agent opens a GitHub pull request instead, one repository per project, nothing
merged automatically.

### Pricing

| Plan | Monthly | Annual | Credits |
| --- | --- | --- | --- |
| Free AI CMO | £0 equivalent, $0 | $0 | 5 credits, one time |
| AI CMO Lite | $129 | $1,290 ($108/mo) | 2,000 per month |
| AI CMO Pro | $249 | $2,490 ($208/mo) | 2,000 per month |
| Agency | volume pricing | from $59 per site (per llms.txt) | unverified |

Credit costs: article 18, SEO and GEO analysis 10, website refresh 10, Hacker
News post 9, Reddit thread 8, LinkedIn post 7, X post 5, UGC video 60. Top-ups
at $45 for 860, $90 for 2,000, $180 for 4,600, and top-up credits do not
expire.

Two things follow that the pricing page does not spell out. **Lite and Pro get
the same 2,000 credits**, so the tier difference is which agents you may use,
not how much you may do. And the **free plan's 5 credits are one-time**, which
is half of a single SEO and GEO analysis. The free tier is a demonstration, not
a usable product.

---

## 3. What Okara does better, stated plainly

**Content volume, by a factor of ten.** 498 indexed URLs against our 46:
roughly 300 blog posts, about 130 "skills" pages, 24 industry pages, 15 prompt
pages, 8 free tools, a full docs site, and more than 60 "X alternatives" pages
covering Ahrefs, Semrush, Moz, Profound, Peec, Otterly, Scrunch, Jasper,
Clearscope and most of the field. That programme is well built and it is
working.

**Their `llms.txt` is a real one.** 168 lines, a proper description, sections
for product, docs, agents, tools and blog, each entry with a line saying what
it answers. Most sites that publish one publish a sitemap with different
punctuation. This is the convention used correctly.

**Distribution breadth.** Reddit, Hacker News, X, LinkedIn and influencer
outreach are channels this platform does not touch at all, and for a founder
with no audience they are often where the first thousand users actually come
from.

**A coding agent that opens pull requests.** The strongest thing in the
product. It is the correct answer to "how does a fix reach a site that is not
on WordPress", and it is the answer this platform gives too.

**They are honest about several limits.** "Soon" labels on TikTok, Instagram
and Slack. "Paid plan only" on GEO and sub-page audits. "Flagged as manual" for
structural fixes. "Nothing is merged automatically." Those are all stated in
the docs rather than buried.

---

## 4. What we found wrong, with evidence

### 4.1 The llms.txt contradicts the pricing page

Okara's `llms.txt` states:

> "Free plan available; full AI CMO plan is $99/month (or $66/month billed
> annually)."

and

> "Pricing: Free plan ($0, 5 credits ≈ 50 messages) and AI CMO plan ($99/mo, or
> $66/mo billed annually, 2,000 credits ≈ 20,000 messages)."

The pricing page has no $99 tier and no $66 tier. It has AI CMO **Lite** at
$129 monthly or $108 annual equivalent, and AI CMO **Pro** at $249 monthly or
$208 annual equivalent. The words "Lite" and "Pro" do not appear in `llms.txt`
at all, so the file describes a single-plan structure that has since become two
plans at higher prices.

This is the most consequential error on the site, and it is specific to what
they sell. `llms.txt` exists to tell ChatGPT, Perplexity, Claude and Gemini
what a company is and charges. A GEO company's own AI-facing file is currently
feeding those engines a price that is 24% to 61% below what a buyer would
actually pay.

### 4.2 The $99 claim is also on two product pages

`/agent/seo` and `/agent/geo` both say "From $99/mo", and the SEO page's
comparison table lists Okara's monthly cost as "From $99/mo" against Frase and
Surfer at $49 to $249. `$99` appears nowhere on `/pricing`. The cheapest real
entry is $108 a month on an annual commitment, or $129 monthly.

### 4.3 No entity on the homepage, from a company selling GEO

Okara's homepage carries exactly one JSON-LD graph, and its types are
`FAQPage`, `Question` and `Answer`. There is no `Organization`, no `WebSite`,
no `SoftwareApplication`.

Our audit flags this as `entity_unclear`. It is worth spelling out why it is
pointed: a model resolving "Okara" has no authoritative entity definition on
the company's own front page to resolve against, and "entity clarity" is one of
the three things their own GEO agent tells customers to fix.

### 4.4 The GEO score blends measured and modelled inputs

Their docs define it as a 0 to 100 measure that "factors in your site files,
content structure, AI mentions across the web, and how often you appear in
responses to relevant queries."

Site files and content structure are directly measurable. AI mentions across
the web and citation frequency are sampled or modelled. Combining all four into
one number means a customer cannot tell which part moved, and a score that
moves because the sampling moved reads the same as one that moved because the
site improved. This platform splits those deliberately and refuses to render a
score whose main input is missing.

### 4.5 Fifteen prompts is a small sample for a distribution

A model's answer is one sample of a stochastic system. Fifteen tracked prompts
across four engines is 60 measurements, and week-to-week movement at that
sample size is substantially noise. Their own weekly progress illustration
shows "Claude 45 to 45, unchanged" and "Gemini 0 to 31, New", which is the
shape sampling noise produces.

### 4.6 Transient bot protection on their own origin

Okara intermittently refuses ordinary requests. During this research, two
fetches returned SSL connection resets and returned 200 on immediate retry, and
one fetch of a blog post returned a body with zero extractable words while the
same URL served 2,205 words a minute later.

This is recorded for two reasons. It is the same behaviour our own 100-site
study found on 10% of well-known SaaS sites, and bot protection does not
reliably distinguish a research crawler from an answer engine. And it caused
two false findings in our own engine, which is section 6.

---

## 5. Our audit of okara.ai

Run 20 September 2026, 60 pages, no API keys, no data vendor, 65 seconds,
$0.00.

```
60 pages · 162 findings · health 90.0 · AEO 70.6 · authority not measured
```

| Severity | Code | Count |
| --- | --- | --- |
| medium | no_direct_answer | 23 |
| medium | schema_missing | 3 |
| medium | entity_unclear | 1 |
| medium | orphan_page | 1 |
| low | image_legacy_format | 60 |
| low | image_no_dimensions | 59 |
| low | title_too_long | 15 |

**Health 90.0 is a high score and it should be said plainly.** There is nothing
critical and nothing high. The technical foundation is good: clean robots.txt
with a sitemap directive, a real llms.txt, no blocked AI crawlers, a 498-URL
sitemap, a median of 2,829 words in the served HTML, and question headings on
the homepage.

The substantive findings are two. **`no_direct_answer` on 23 pages** means the
page does not answer its own question in the opening paragraph, which is the
unit an answer engine extracts, from a company selling answer-engine
optimisation. And **`entity_unclear`**, covered above.

Everything else is image hygiene: 60 legacy-format images and 59 without
dimensions. Real, cheap to fix, and not why anyone wins or loses.

Authority is not shown, because nothing in this run measured a backlink
profile.

---

## 6. What this audit found wrong with us

Auditing a real 60-page site produced 47 findings that were not real, and both
causes were defects in our own engine. Both are now fixed with regression
tests, and both are recorded here because a comparison that only finds faults
on one side is a brochure.

**`schema_contradicts_page` fired 45 times, once per blog post.** The check
compared an Article headline against `main_text`, which is chrome-stripped, and
an article's headline lives in the page header that `mainRegion()` deliberately
removes. Every correctly built post on the site was marked as contradicting its
own markup, while its `h1` matched the schema headline character for character.
The headline is now checked against the title and the headings as well as the
body. Both engines had it.

**`page_404_linked` fired twice on pages that were not broken.** The Python
check treated `status == 0` as a broken link, and status 0 means the fetch
failed: a timeout, a reset connection, an SSL error. Both URLs returned 200 on
the very next request. Only 404 and 410 count now, which is what the TypeScript
engine always did.

After both fixes: 204 findings to 162, health 79.3 to 90.0, AEO 66.2 to 70.6.
**The site was better than we first said it was**, which is the expensive
direction to be wrong in.

---

## 7. Head to head

### Search and answer engines

| | Okara | This platform |
| --- | --- | --- |
| Check catalogue | Not enumerated publicly | 90 in TypeScript, 74 in Python, published with impact, effort, confidence and the fix |
| Fix throughput | 2 per day | Every fix generatable from one crawl |
| Auto-apply coverage | 7 fix types, WordPress and Webflow | 7 artefact kinds: meta, HTML, JSON-LD, files, redirects, link plans, copy |
| Code-level fixes | GitHub pull requests | WordPress, Shopify, Webflow, Ghost, GitHub PR, webhook |
| Free tier | Homepage audit, 5 one-time credits | Full site audit, every check, every fix, no account, no limit |
| GEO tracking | 4 engines, 15 prompts, paid only | Prompts derived from the crawl in 5 shapes, on your own model key at cost |
| Measurement honesty | GEO score blends measured and modelled | A score whose main input is missing renders as not measured, with the reason |
| Coverage statement | Not addressed | A capped run states its coverage above the score |
| Crawler-invisibility detection | Not offered | 3 checks, plus a named list of the injection tools doing it |
| Link programme | "Link Broker" marked Soon | Prospects, two-number risk model, verification reading rel from HTML, mentions weighted above links |
| Local SEO | Not a product area | 8 checks, GBP posting, review replies, citations, geo-grid |
| Self-hosting | No | Apache-2.0, Docker Compose, your own database |

### As a business

| | Okara | This platform |
| --- | --- | --- |
| Indexed pages | 498 | 46, and noindex until the domain exists |
| Channels | SEO, GEO, content, Reddit, HN, X, LinkedIn, influencer, UGC | Search, answer engines, local, links |
| Billing | Live, Stripe, three tiers plus agency | Built, provider-agnostic, not configured |
| Accounts | Live | Built, not provisioned |
| Scheduled work | Runs daily, server side | Needs a browser tab. Stated on screen |
| Social proof | 3 case studies, ~25 logos, claimed 100,000 users | None |
| Company | Founded 2025, Singapore, named founder | None |

---

## 8. The verdict

**Okara is the better product today and it is not close on the axes that decide
a purchase.** It exists, it takes money, it covers nine channels this platform
does not, it has 498 pages of content working for it, and a founder can buy it
this afternoon. Anyone choosing a tool this week should choose Okara.

**On the search engine itself, this platform is deeper, and that gap is real
rather than rhetorical.** Ninety published checks against an unenumerated
surface. Every generatable fix from one crawl against two per day. Fix
generation in seven artefact formats against seven fix types on two CMSes.
Detection of the JavaScript-injection problem that nobody else in the category
names. A link programme with a risk model that separates waste from danger. A
local module. And a measurement discipline that refuses to render a number
whose main input is missing, which is precisely where their GEO score does the
opposite.

**The uncomfortable part.** Okara has independently arrived at the two
positions this repository treats as its moat. They ship fixes as pull requests,
so "a fix you own beats a fix you rent" is no longer ours alone. And their
marketing is largely honest, with "Soon" labels and "paid only" notices where
they belong. The differentiation left is depth, coverage, and the specific
refusal to blend a measured number with a modelled one. That is a narrower moat
than the one we had against Mavek, and it is worth knowing that before writing
a comparison page.

**What would change the verdict.** Headless crawling, so scheduled work does
not wait for a tab. A configured checkout. And enough content that the engine
is discoverable, because right now the better engine is the one nobody can
find.

**What we should take from them.** The five strategy documents as an
inspectable artefact the customer can read. The "two fixes a day" insight,
which is the same behavioural problem our batching solves and a better piece of
marketing than ours. The alternatives-page programme, which is 60 pages of
bottom-funnel intent we have five of. And the docs site, which they publish as
Markdown for machines to read, and we do not publish at all.

---

## 9. Claims recorded as unverified

Listed rather than repeated as fact:

- "Used by 100,000+ users."
- The customer logo wall, captioned "trusted by teams at" rather than
  "customers of".
- Agency pricing "from $59 per month", which appears only in `llms.txt`.
- "$99/mo" on `/agent/seo` and `/agent/geo`, which contradicts `/pricing` and
  is treated here as a stale figure rather than an offer.
- The three case-study percentages, which are attributed to named founders but
  not independently checkable.
