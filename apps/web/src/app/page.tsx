import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { TheFlow } from "@/components/the-flow";
import { UrlStart } from "@/components/url-start";
import { CATALOG_SIZE } from "@/engine/catalog";
import { DESKS, deskPrice, managerFor, WHOLE_AGENCY } from "@/lib/desks";
import { DIRECTOR, headcount } from "@/lib/org";
import { PLANS, priceLabel } from "@/lib/plans";

export const metadata = {
  // The homepage keeps the layout's default title rather than restating it,
  // so the product name lives in exactly one place.
  description:
    `Everything a digital marketing agency does, without the agency. ${headcount()} specialists across search, content, social and paid do the work and you approve it. Published prices, no retainer, no call. Look inside a live account before you give us anything.`,
  alternates: { canonical: "/" },
};

/*
 * The home page, in nine bands.
 *
 * The order is the argument, and the order is the part worth defending.
 * Nothing above the fold asks for input: a stranger will not hand over their
 * domain to a company they cannot yet describe to a colleague. Tools open with
 * a field. Agencies open with a claim, a price, and something to look at.
 *
 * The audit is band eight rather than band one on purpose. It now confirms a
 * decision instead of trying to start one, which also means a thin result no
 * longer costs the sale.
 */

/** A week's shape, labelled as a shape. The real thing runs live on /inside. */
const WEEK = [
  { t: "Mon 06:00", who: "account-director", what: "Weekly cycle opened, assigned to 2 desks" },
  { t: "Mon 06:02", who: "tech-auditor", what: "Crawled 142 pages, 38 findings, 24 with the fix written" },
  { t: "Mon 06:19", who: "schema-engineer", what: "Product markup written for 47 pages, entity graph left intact" },
  { t: "Mon 06:31", who: "voice-analyst", what: "Rhythm 0.34 against a field median of 0.61, material" },
  { t: "Mon 06:44", who: "angle-finder", what: "Read 9 ranking pages, one entry nobody took" },
  { t: "Tue 09:12", who: "publisher", what: "9 approved changes pushed to WordPress, all 9 verified live" },
  { t: "Tue 09:20", who: "ai-visibility-analyst", what: "Blocked. No Search Console connected", blocked: true },
  { t: "Fri 16:00", who: "reporter", what: "Referring domains moved less than the floor. Printed flat" },
];

/** A composite of published UK market rates, with the basis stated. */
const RETAINER = [
  { line: "Technical audit and findings report", hrs: 6, amount: "960", now: "Crawled, 90 checks, and the fixes written rather than listed" },
  { line: "On-page implementation", hrs: 5, amount: "800", now: "Pushed through your CMS and re-fetched to confirm" },
  { line: "Structured data markup", hrs: 3, amount: "480", now: "Written, and it resolves @id before it complains" },
  { line: "Keyword and competitor research", hrs: 4, amount: "640", now: "Competitor pages fetched and measured, not summarised" },
  { line: "Content briefs", hrs: 4, amount: "640", now: "Built from measured gaps and an approved point of view" },
  { line: "Copywriting, four pieces", hrs: 10, amount: "1,600", now: "Nine agents, three gates, one asks if anyone would finish it" },
  { line: "Link prospecting and outreach", hrs: 4, amount: "640", now: "Drafted into your own mail client. We never send" },
  { line: "Monthly reporting", hrs: 4, amount: "640", now: "Weekly, and it reads a flat week as flat" },
];

const REFUSALS = [
  {
    title: "No disavow without a manual action",
    body: "Google's own guidance is that the tool is not normal site maintenance. A careless disavow removes links that were counting in your favour, and the damage is slow and hard to see.",
  },
  {
    title: "No tone verdict on two rivals",
    body: "Three readable competitor pages is the floor. Two is one writer's habit, and asking you to rewrite your site against it would be the expensive kind of wrong.",
  },
  {
    title: "No score without a measurement",
    body: "Forty of fifty-five pages crawled is a score of those forty, and you are told that above the number rather than under it. A signal nothing measured gets a sentence, not a figure.",
  },
  {
    title: "We cannot read Google's results pages",
    body: "Search engines block automated queries and their terms forbid scraping. Difficulty comes from signals we can actually see, and anything presented as a prediction says so.",
  },
];

const FAQ = [
  {
    q: "Is this a tool or an agency?",
    a: "An agency, delivered as software. You do not operate it. You connect the accounts once, approve the argument once, then approve finished work in a queue. If a feature ever ends in “paste this into your CMS”, it is unfinished, unless no API exists, in which case the screen says so.",
  },
  {
    q: "What happens if I cancel?",
    a: "The fixes stay applied, because they are in your CMS rather than in our dashboard. The drafts are yours. You can export the whole workspace as JSON at any time, including before you ever pay us anything.",
  },
  {
    q: "Do I have to book a call?",
    a: "No, and there is no call to book. Prices are on this page. Agencies hide price behind a discovery call because their price depends on what they think you can pay.",
  },
  {
    q: "Is it actually AI, or is it a person with a template?",
    a: `${headcount()} agent specifications, each with declared tools and a published list of what it refuses to do, validated when the runtime starts. You can read all of them, and you can watch a run happen.`,
  },
  {
    q: "What about paid ads and social?",
    a: "Not built. They have pages on this site that say so and name the quarter they open, because a page implying a service exists is the one thing this business cannot survive.",
  },
];

export default function Home() {
  const live = DESKS.filter((d) => managerFor(d).status === "live");
  const agencyTotal = RETAINER.reduce((n, r) => n + Number(r.amount.replace(",", "")), 0);
  const agencyHours = RETAINER.reduce((n, r) => n + r.hrs, 0);

  return (
    <MarketingChrome>
      {/* 01 — The swap and the number. No input above the fold. */}
      <section className="section hero" style={{ paddingTop: "3.4rem" }}>
        <div className="eyebrow">A digital marketing agency, staffed by {headcount()} agents</div>
        <h1 className="hero-title">Everything an agency does. None of the agency.</h1>
        <p className="hero-lede">
          {headcount()} specialists across search, content, social and paid. They do the work, you approve it, and
          you can watch the whole thing happen. From {priceLabel(PLANS.starter)} a month. No retainer, no minimum term, and no call to book.
        </p>
        <div className="hero-actions">
          <Link href="/inside" className="button primary big-button">Look inside a live account</Link>
          <Link href="/the-firm" className="button big-button">Meet the {headcount()}</Link>
        </div>
        <p className="small faint" style={{ marginTop: "0.9rem" }}>
          Nothing to enter. The account below is real and the audit inside it runs against our own site.
        </p>
      </section>

      {/* 02 — Self-selection. The most valuable interaction on the page. */}
      <section className="section section-tight">
        <h2 className="section-title small-title">Four desks. Pick the one you came for.</h2>
        <div className="desk-tiles">
          {DESKS.map((desk) => {
            const manager = managerFor(desk);
            const open = manager.status === "live";
            return (
              <Link key={desk.key} href={desk.path} className={open ? "desk-tile" : "desk-tile soon"}>
                <span className="desk-name">{desk.label}</span>
                <span className="desk-count">
                  {open ? `${manager.team.length} specialists` : `Opens ${manager.opens}`}
                </span>
                <span className="desk-line">{desk.headline}</span>
                <span className="desk-delivers">{manager.delivers}</span>
                <span className="desk-price">{deskPrice(desk)}</span>
              </Link>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: "0.9rem" }}>
          All {DESKS.length} are built. They are not all equally finished, and each tile says where it stops:
          search publishes straight to your CMS, while social and paid can research, plan and draft everything but
          need each network to approve this software before they can post or launch. That is written on every desk
          page rather than discovered later.{" "}
          <Link href={WHOLE_AGENCY.path}>All of them on one plan</Link>.
        </p>
      </section>

      {/* 02b — What to click. Added after a reader asked where the dashboard was. */}
      <section className="section section-tight">
        <TheFlow heading="Where the product is, and what each step costs you" />
      </section>

      {/* 03 — Proof before claims. */}
      <section className="section">
        <div className="eyebrow">A week, in the shape it actually takes</div>
        <h2 className="section-title">You can see what happened, and when, and who did it.</h2>
        <p className="section-lede">
          An agency is a black box: you pay, and things happen in a Slack channel you are not in. Every action here is
          logged with the agent that took it, including the ones that stopped.
        </p>
        <div className="runlog">
          {WEEK.map((row) => (
            <div key={row.t + row.who} className={row.blocked ? "runrow blocked" : "runrow"}>
              <span className="rt">{row.t}</span>
              <span className="rw">{row.who}</span>
              <span className="rx">{row.what}</span>
            </div>
          ))}
        </div>
        <p className="small faint" style={{ marginTop: "0.7rem" }}>
          A worked example of the shape of a week, not a specific client. The real thing, running live against our own
          site, is on <Link href="/inside">the inside page</Link>.
        </p>
      </section>

      {/* 04 — Price anchoring, and the product promise made literal. */}
      <section className="section section-alt">
        <div className="eyebrow">Forty hours against two decisions</div>
        <h2 className="section-title">The retainer, line by line, with the lines that are still yours.</h2>
        <p className="section-lede">
          A composite of published UK mid-market retainer rates at £160 an hour. Every line a desk now covers is struck
          through, with what replaced it underneath. Two lines are not struck through, and they are the whole of what
          you do.
        </p>
        <div className="retainer">
          {RETAINER.map((row) => (
            <div key={row.line} className="ret-row">
              <div className="ret-line"><s>{row.line}</s></div>
              <div className="ret-hrs"><s>{row.hrs}h</s></div>
              <div className="ret-amt"><s>£{row.amount}</s></div>
              <div className="ret-now">{row.now}</div>
            </div>
          ))}
          <div className="ret-row keep">
            <div className="ret-line"><strong>Approving the strategy</strong></div>
            <div className="ret-hrs">&mdash;</div>
            <div className="ret-amt">&mdash;</div>
            <div className="ret-now">Once, at the start. One message, not five.</div>
          </div>
          <div className="ret-row keep">
            <div className="ret-line"><strong>Approving finished work</strong></div>
            <div className="ret-hrs">&mdash;</div>
            <div className="ret-amt">&mdash;</div>
            <div className="ret-now">A queue, batched weekly. Also yours.</div>
          </div>
          <div className="ret-total">
            <span>Agency, {agencyHours} hours</span>
            <span className="was">£{agencyTotal.toLocaleString("en-GB")}</span>
            <span>This, everything above</span>
            <span className="now">{priceLabel(PLANS.growth)} a month</span>
          </div>
        </div>
      </section>

      {/* 05 — The differentiator, surfaced. */}
      <section className="section">
        <div className="eyebrow">The roster</div>
        <h2 className="section-title">{headcount()} specialists, and each one publishes what it will not do.</h2>
        <p className="section-lede">
          Every agent is declared with the tools it may touch and the one thing it refuses, checked when the runtime
          starts rather than written on a page. Nobody generating slop publishes constraints.
        </p>
        <div className="card-grid">
          {live.flatMap((desk) => managerFor(desk).team.slice(0, 2)).slice(0, 4).map((member) => (
            <div className="card" key={member.key}>
              <h3>{member.name}</h3>
              <p>{member.role}</p>
              <span className="never-line"><b>Never</b>{member.never}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/the-firm" className="button">See all {headcount()}, and every refusal</Link>
        </p>
      </section>

      {/* 06 — Publishing limits is the cheapest trust available. */}
      <section className="section section-alt">
        <div className="eyebrow">Where it stops</div>
        <h2 className="section-title">Four things it refuses to do, in writing, before you pay.</h2>
        <div className="card-grid">
          {REFUSALS.map((r) => (
            <div className="card muted-card" key={r.title}>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 07 — The price, on the page, with no call. */}
      <section className="section">
        <div className="eyebrow">Price</div>
        <h2 className="section-title">On this page, because hiding it tells you how an agency charges.</h2>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">{priceLabel(PLANS.free)}</span>
            <span className="stat-label">The audit. No account, no card, no time limit.</span>
          </div>
          <div className="stat">
            <span className="stat-value">{priceLabel(PLANS.starter)}</span>
            <span className="stat-label">Per site, per month. The search desk, fixes applied.</span>
          </div>
          <div className="stat">
            <span className="stat-value">{priceLabel(PLANS.growth)}</span>
            <span className="stat-label">Per site, per month. Every desk, content and links included.</span>
          </div>
        </div>
        <p style={{ marginTop: "1rem" }}>
          No onboarding fee, no minimum term. Cancel and the fixes stay applied, because they are in your CMS rather
          than in our dashboard. <Link href="/pricing">What each plan permits</Link>.
        </p>
      </section>

      {/* 08 — The audit, as the close rather than the opener. */}
      <section className="section section-alt">
        <div className="eyebrow">Now, if you want it</div>
        <h2 className="section-title">See what we would fix on your site this week.</h2>
        <p className="section-lede">
          {CATALOG_SIZE} checks over a real crawl, in about four minutes. It runs in your browser, the results stay
          there, and you can export everything. No account and no card, now or later.
        </p>
        <UrlStart />
      </section>

      {/* 09 — The last fear is effort, not price. */}
      <section className="section">
        <div className="eyebrow">The first 72 hours</div>
        <h2 className="section-title">How much of your time this actually takes.</h2>
        <div className="card-grid">
          <div className="card">
            <span className="small faint">Day 0</span>
            <h3>Connect, once</h3>
            <p>
              Search Console, Analytics and your CMS. Whatever is missing becomes a named gap, and every later report
              says which capability is degraded and why rather than quietly scoring around it.
            </p>
          </div>
          <div className="card">
            <span className="small faint">Day 3</span>
            <h3>One decision</h3>
            <p>
              {DIRECTOR.name} assembles a single message: the findings worth acting on, the point of view with its
              ladder, the tone recommendation if one could be measured, and what could not be. You agree or say where
              it is wrong.
            </p>
          </div>
          <div className="card">
            <span className="small faint">Weekly</span>
            <h3>The queue</h3>
            <p>
              Your standing job and nothing else. Approvals are batched, because five notifications about five alt tags
              is a failure of the system rather than a busy week.
            </p>
          </div>
        </div>

        <div className="faq" style={{ marginTop: "2rem" }}>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand
        title="Look inside before you give us anything"
        body="A real account, running against our own site, with the findings we have not fixed still in it. No signup, no URL, no email."
        primary={{ href: "/inside", label: "Look inside a live account" }}
        secondary={{ href: "/pricing", label: "See the prices" }}
      />
    </MarketingChrome>
  );
}
