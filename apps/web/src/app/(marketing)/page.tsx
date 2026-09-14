import Link from "next/link";

import { CtaBand } from "@/components/marketing";
import { UrlStart } from "@/components/url-start";
import { CATALOG_SIZE } from "@/engine/catalog";

export const metadata = {
  title: "SEO OS: the search agency, as software",
  description:
    "Enter your website and the work starts: a real crawl, findings with the fix already written, content briefs, schema, internal links, local listings and link prospects. You approve. It ships. Covers SEO, AEO and GEO.",
};

const DEPARTMENTS = [
  {
    tag: "Technical",
    title: "The crawl, and then the repair",
    body: "Indexability, canonicals, redirect chains, broken links, orphans, sitemaps, hreflang, page weight and render-blocking work. Each finding arrives with the corrected tag, file or rule attached.",
  },
  {
    tag: "Content",
    title: "Briefs, drafts, and a gate before anything ships",
    body: "Gaps found from your own content and your competitors, turned into briefs with outlines, answer blocks, FAQs and schema. Drafts go through quality gates that fail on unverified claims and machine-writing tells.",
  },
  {
    tag: "Structured data",
    title: "Schema that matches the page",
    body: "Organization, LocalBusiness, Article, Product, FAQ and Breadcrumb JSON-LD, generated from what the page actually contains. Required properties checked, invalid blocks rewritten.",
  },
  {
    tag: "AI answers",
    title: "AEO and GEO, treated as work rather than a dashboard",
    body: "Which answer engines can reach you, whether your content survives without JavaScript, whether your passages are quotable, and the llms.txt, entity markup and answer blocks that fix it.",
  },
  {
    tag: "Local",
    title: "Maps, profiles and reviews",
    body: "NAP consistency across the site, LocalBusiness markup, location pages that are not the national page with the city swapped in, and Business Profile posts and review replies drafted for approval.",
  },
  {
    tag: "Off page",
    title: "Prospects, not a backlink chart",
    body: "Entity records you are missing, sites you already cite that could cite you back, and competitor link sources. Outreach is drafted and sent from your domain, never ours, under a per-domain cap.",
  },
];

const PRINCIPLES = [
  {
    title: "It does the work",
    body: "An audit tool tells you your titles are duplicated. This writes the replacement titles, the JSON-LD, the sitemap, the robots.txt and the internal link plan, then queues them for you to approve.",
  },
  {
    title: "You keep the veto",
    body: "Five autonomy levels. Reversible technical fixes can ship on their own; anything written in your voice or sent from your domain always waits for a person. No setting authorises a site-wide or irreversible action.",
  },
  {
    title: "Nothing is invented",
    body: "Every number on every screen came from a real crawl of your real site. A draft that states something the brief did not supply is marked unverified and blocked before you see it.",
  },
  {
    title: "It runs without us",
    body: "The audit uses no model and no data vendor, so it costs nothing per run. Drafting uses your own provider key, held in your browser. There is no account of ours in the loop.",
  },
];

const FAQS = [
  {
    q: "Do I need to connect anything to get value?",
    a: "No. The audit runs on your public site alone, which is why you can run one right now without an account. Connecting Search Console, analytics or your CMS makes the work sharper and lets approved changes ship automatically, but nothing is gated behind it.",
  },
  {
    q: "Will it publish something I have not read?",
    a: "Not unless you tell it to, and never for content. Drafting and outreach always wait for a person regardless of the autonomy level. Technical fixes can be set to ship on their own once you trust them, and every one of those is reversible.",
  },
  {
    q: "How is this different from Semrush or Ahrefs?",
    a: "Those are measurement. They tell you what is wrong and the fixing is still somebody's job, usually an agency's. This produces the change itself, then reports on what it did and whether it worked.",
  },
  {
    q: "How is it different from an AI article writer?",
    a: "Those solve the cheapest part of the problem and create a new one: volume with no brand grounding, no fact discipline and no technical work. Here, content is one department out of several, and a draft cannot reach you with an unsourced claim in it.",
  },
  {
    q: "What does it cost to run?",
    a: "The crawl and the full check catalogue cost nothing per run: no model call, no data provider. Search Console is free and is a better keyword source than most paid tools for any site that already ranks. Model spend only starts when you ask it to draft, and it is your key and your bill.",
  },
  {
    q: "Can I host it myself?",
    a: "Yes. The whole platform is in one repository: a FastAPI service, a mission worker, Postgres and this dashboard. Docker Compose brings the stack up. Nothing phones home.",
  },
];

export default function Home() {
  return (
    <>
      <section className="section hero" style={{ paddingTop: "4rem" }}>
        <div className="hero-split">
          <div>
            <div className="eyebrow">SEO, AEO and GEO in one platform</div>
            <h1>Everything an SEO agency does, without the agency.</h1>
            <p className="lede">
              Enter a website. It gets crawled for real, checked against {CATALOG_SIZE} audit criteria, and handed
              back with the fixes already written: titles, schema, sitemaps, internal links, content briefs, local
              markup and link prospects. You approve the work. It ships and reports on what changed.
            </p>
            <UrlStart />
            <p className="small muted" style={{ marginTop: "0.85rem", marginBottom: 0 }}>
              No account, no card, no integrations. The first run takes about a minute.
            </p>
          </div>

          <div>
            <div className="mock">
              <div className="mock-bar">
                <i /><i /><i />
                <span>seo-os / run 01</span>
              </div>
              <div className="mock-body">
                <div className="grid grid-2">
                  <ScoreMock label="Search health" value={62} band="bad" />
                  <ScoreMock label="AI readiness" value={41} band="bad" />
                  <ScoreMock label="Authority" value={58} band="bad" />
                  <ScoreMock label="Experience" value={79} band="warn" />
                </div>
                <div className="steps">
                  <StepMock state="done" label="Crawled 40 pages, read robots.txt and 2 sitemaps" />
                  <StepMock state="done" label="31 findings, 18 with the fix generated" />
                  <StepMock state="done" label="6 content briefs written from the gaps" />
                  <StepMock state="running" label="Waiting on you: 18 approvals, 4 need reading first" />
                </div>
              </div>
            </div>
            <p className="tiny faint center" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
              An illustration of the run screen. Your numbers come from your own site.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="stat-band">
          <div><div className="n">{CATALOG_SIZE}</div><div className="l">Audit criteria, each with severity, impact and effort</div></div>
          <div><div className="n">12</div><div className="l">Answer engines checked for crawl access</div></div>
          <div><div className="n">0</div><div className="l">Model calls needed for an audit</div></div>
          <div><div className="n">You</div><div className="l">Approve everything written in your voice</div></div>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">The gap</div>
        <h2 className="section-title">Every tool tells you what is wrong. Then it stops.</h2>
        <p className="section-lede">
          That is the whole category. A company with an enterprise SEO subscription still needs somebody to read
          the audit, decide what matters, write the content, brief a developer, run the outreach and explain the
          results. That somebody costs between two and fifteen thousand a month, and the tool is a line item
          inside their cost base.
        </p>
        <div className="feature-grid">
          {PRINCIPLES.map((item) => (
            <div className="feature" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">What it covers</div>
          <h2 className="section-title">Six departments, one run.</h2>
          <p className="section-lede">
            An agency splits this across a technical lead, a content strategist, a writer, a local specialist and
            an outreach team. Here they are missions that run on a schedule and report into the same place.
          </p>
          <div className="feature-grid">
            {DEPARTMENTS.map((item) => (
              <div className="feature" key={item.title}>
                <span className="tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: "1.6rem" }}>
            <Link href="/platform">The full breakdown, department by department</Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">AI answers</div>
        <h2 className="section-title">Ranking first is worth less every quarter.</h2>
        <p className="section-lede">
          More searches end inside an answer than on a results page. That answer is assembled from pages a model
          could reach, parse and trust. Most sites fail at the first step and have no idea, because nothing they
          use checks it.
        </p>
        <div className="feature-grid">
          <div className="feature">
            <span className="tag">Access</span>
            <h3>Twelve crawlers, checked individually</h3>
            <p>
              GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended and the rest.
              Blocking them is a legitimate decision. Blocking them by accident, through a robots.txt somebody
              copied in 2023, is not.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Extraction</span>
            <h3>What arrives before JavaScript runs</h3>
            <p>
              If the served HTML is an empty shell, an engine that does not execute scripts sees nothing. This is
              measured per page and reported as a finding, not a footnote.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Citability</span>
            <h3>Passages worth quoting</h3>
            <p>
              Direct answers near the top, specific figures, named authors, sourced claims, FAQ structure and an
              entity a model can resolve. Each one is checked, and each gap comes with the block that fills it.
            </p>
          </div>
        </div>
        <p style={{ marginTop: "1.6rem" }}>
          <Link href="/ai-search">How AEO and GEO work here</Link>
        </p>
      </section>

      <section className="section section-alt">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">The loop</div>
          <h2 className="section-title">Run, approve, ship, measure. Then do it again.</h2>
          <div className="timeline" style={{ marginTop: "2rem", maxWidth: "62ch" }}>
            <div className="timeline-item">
              <div className="timeline-when">Minute one</div>
              <h3>It crawls</h3>
              <p>
                robots.txt, every sitemap it can find, then the pages themselves. You watch the count climb. Nothing
                is stubbed and no result is cached from somebody else&apos;s site.
              </p>
            </div>
            <div className="timeline-item">
              <div className="timeline-when">Minute two</div>
              <h3>It finds, and it fixes</h3>
              <p>
                The full catalogue runs. Every finding carries why it matters, how much it is worth, how hard it is,
                and where it was found. Where a fix can be generated, it already has been.
              </p>
            </div>
            <div className="timeline-item">
              <div className="timeline-when">Same session</div>
              <h3>It plans the content</h3>
              <p>
                A topic model from your own pages, the gaps against your competitors and your target terms, then
                briefs with outlines, answer blocks, FAQs, internal links, meta and schema.
              </p>
            </div>
            <div className="timeline-item">
              <div className="timeline-when">When you are ready</div>
              <h3>You approve</h3>
              <p>
                Batched by risk. Low-risk reversible items can be set to auto-approve after a delay you choose.
                Anything in your voice waits for you, and anything site-wide waits for you forever.
              </p>
            </div>
            <div className="timeline-item">
              <div className="timeline-when">Next run</div>
              <h3>It reports the difference</h3>
              <p>
                Not the current state. The difference: what cleared, what appeared, what got worse, which pages
                changed and which way the scores moved, against the run before it.
              </p>
            </div>
          </div>
          <p style={{ marginTop: "0.5rem" }}>
            <Link href="/how-it-works">A full run, step by step</Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">Questions</div>
        <h2 className="section-title">The things people ask first.</h2>
        <div style={{ marginTop: "1.5rem" }}>
          {FAQS.map((item) => (
            <div className="faq-item" key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand secondary={{ href: "/pricing", label: "See pricing" }} />
    </>
  );
}

function ScoreMock({ label, value, band }: { label: string; value: number; band: string }) {
  const colour = band === "good" ? "var(--ok)" : band === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <div className="card score card-flat">
      <div className="label">{label}</div>
      <div className="value" style={{ color: colour }}>{value}</div>
      <div className="meter"><span style={{ width: `${value}%`, background: colour }} /></div>
    </div>
  );
}

function StepMock({ state, label }: { state: string; label: string }) {
  return (
    <div className={`step step-${state}`}>
      <span className="step-dot" />
      <span className="small">{label}</span>
    </div>
  );
}
