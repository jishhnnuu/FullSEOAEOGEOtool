import Link from "next/link";

import { LabCta } from "@/components/lab/chrome";
import { ToolIcon } from "@/components/lab/icons";
import { LabScene } from "@/components/crew/scenes";
import { LAB, labPath } from "@/lib/brand";
import { PLANS, PLAN_ORDER, priceLabel } from "@/lib/plans";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: `${LAB}: all your marketing in one place`,
  description:
    "Your website, Google data, content, social and ads in one platform. It finds what to do next, writes the fix, publishes when you approve, and shows you what changed. Free to start.",
  alternates: { canonical: "/thymelab" },
};

/*
 * Thymelab's front door, for someone who wants to do it themselves.
 *
 * What they pay for is results from one place: the work that would otherwise
 * mean an SEO tool, a writing checker, a social tracker, an ads calculator,
 * two Google tabs and someone to join them up. So the page leads with the
 * loop (connect, it says what's next, you approve, it goes live, you see the
 * result) and then says plainly which parts of that loop work today. It is
 * never called an experiment and the tools are never "instruments": people
 * are paying for an outcome, not a trial.
 */

const AREAS = [
  {
    key: "seo" as const,
    code: "SEO",
    title: "Get found on Google and in AI answers",
    body: "Every page checked, every problem ranked, and the fix written. Approve it and it goes live.",
    href: labPath("/seo"),
  },
  {
    key: "content" as const,
    code: "Content",
    title: "Write pages that sound like you",
    body: "Measure your pages against the ones you compete with, and see exactly what to change.",
    href: labPath("/content"),
  },
  {
    key: "social" as const,
    code: "Social",
    title: "Post what actually works",
    body: "See which of a competitor's posts beat their usual, and the hooks the winners share.",
    href: labPath("/social"),
  },
  {
    key: "ads" as const,
    code: "Ads",
    title: "Spend only where it can work",
    body: "Check a budget is big enough to learn before a penny goes out, with the maths shown.",
    href: labPath("/ads"),
  },
  {
    key: "website" as const,
    code: "Websites",
    title: "Build a site that's found from day one",
    body: "Build and launch your own website with SEO done properly. We're building it now.",
    href: labPath("/website"),
    soon: true,
  },
];

/** What works today and what does not yet. Kept in step with the product, never ahead of it. */
const TODAY: { live: boolean; what: string; detail: string }[] = [
  { live: true, what: "Check any website", detail: "Every page read, every fixable problem with its fix written." },
  { live: true, what: "Google, in one sign-in", detail: "Search Console and Analytics connected together and synced." },
  { live: true, what: "Approve and publish", detail: "Approved fixes go live on WordPress, with undo." },
  { live: true, what: "Ask what to do next", detail: "The AI CMO answers from your own data and names the next step." },
  { live: true, what: "Content, social and ads checks", detail: "Voice against rivals, competitor posts, budget maths." },
  { live: false, what: "Other website platforms", detail: "Until each connection ships, you get the exact change to paste." },
  { live: false, what: "Posting and running ads from here", detail: "Waiting on each platform to approve our app." },
  { live: false, what: "The website builder", detail: "In the works. Join the list on the Websites page." },
];

const FAQ = [
  {
    q: `Is ${LAB} free?`,
    a: "Every tool has a free version that needs no signup. The paid plans add bigger checks, saved history, weekly re-runs and publishing fixes straight to your website.",
  },
  {
    q: "Will it tell me what to do?",
    a: "Yes. Every check ends with the one thing to do first and the fixes queued for your yes. In your dashboard, ask the AI CMO what to do next and it answers from your own data. You approve; it does the rest wherever it can connect.",
  },
  {
    q: "Do I need to know SEO or marketing?",
    a: "No. Every result is in plain English, and every problem comes with what to do about it, usually written out so you can copy it.",
  },
  {
    q: "Where does my data go?",
    a: "The checks run in your browser. We fetch the public pages for you, because a browser cannot read another website directly, and keep nothing about them.",
  },
  {
    q: "What if I'd rather someone did it for me?",
    a: "That's our agency. The same platform, with a specialist doing the work for you.",
  },
];

export default function LabHome() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }} />

      <section className="lab-section lab-hero tone-seo">
        <div>
          <span className="lab-eyebrow">{LAB} &middot; do it yourself, all in one place</span>
          <h1 className="lab-title">
            All your marketing, in <span className="glow">one place.</span>
          </h1>
          <p className="lab-lede">
            Your website, Google, content, social and ads, in one platform instead of five. It tells you what to do
            next and writes the work. You approve, it goes live, and you see what changed.
          </p>
          <div className="lab-actions">
            <Link href={labPath("/seo/audit")} className="lab-btn">Start with your website &rarr;</Link>
            <Link href="#how" className="lab-btn ghost">See how it works</Link>
          </div>
          <div className="lab-status">
            <span>Free to start</span>
            <span>No signup for the first check</span>
            <span>Plain English</span>
          </div>
        </div>
        <LabScene />
      </section>

      <section className="lab-section tone-seo" id="how">
        <span className="lab-eyebrow">How it works</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>From problem to result, without leaving.</h2>
        <div className="lab-steps four">
          <div className="lab-card">
            <h3>Connect</h3>
            <p>Your website, then Google in one sign-in. Search Console and Analytics come in together.</p>
          </div>
          <div className="lab-card">
            <h3>It tells you what&rsquo;s next</h3>
            <p>Every problem ranked by how much it matters, with the fix written. Ask the AI CMO anything.</p>
          </div>
          <div className="lab-card">
            <h3>You approve</h3>
            <p>Nothing changes without your yes. Approve one fix, or a whole batch at once.</p>
          </div>
          <div className="lab-card">
            <h3>It goes live, you see results</h3>
            <p>Approved fixes publish to your site, and your clicks and conversions sit beside the work.</p>
          </div>
        </div>
      </section>

      <section className="lab-section tone-seo">
        <span className="lab-eyebrow">One login instead of five</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Everything an agency would do, in one platform.</h2>
        <div className="lab-swap">
          <div className="lab-card">
            <span className="lab-mono lab-muted">Usually</span>
            <ul className="lab-list plain">
              <li><span>An SEO crawler, and a separate keyword tool</span></li>
              <li><span>Search Console and Analytics in two more tabs</span></li>
              <li><span>A writing checker, a social tracker, an ads calculator</span></li>
              <li><span>Your website&rsquo;s admin, to paste the changes in</span></li>
              <li><span>A spreadsheet, or an agency, to join it all up</span></li>
            </ul>
          </div>
          <div className="lab-card lab-card-on">
            <span className="lab-mono">In {LAB}</span>
            <ul className="lab-list">
              <li><span><b>One check</b> covering technical SEO, content, schema and AI search</span></li>
              <li><span><b>Google connected</b> once, with the data next to the work</span></li>
              <li><span><b>Content, social and ads</b> checks in the same place</span></li>
              <li><span><b>Fixes approved and published</b> from one queue</span></li>
              <li><span><b>A next step, always</b>, from the AI CMO</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lab-section tone-seo" id="tools">
        <span className="lab-eyebrow">What&rsquo;s inside</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Pick where to start.</h2>
        <div className="lab-tools">
          {AREAS.map((tool) => (
            <Link key={tool.key} href={tool.href} className={`lab-tool tone-${tool.key}${tool.soon ? " soon" : ""}`}>
              {tool.soon ? <span className="lt-soon">In the works</span> : null}
              <span className="lt-icon"><ToolIcon tool={tool.key} /></span>
              <span className="lt-code">{tool.code}</span>
              <h3>{tool.title}</h3>
              <p>{tool.body}</p>
              <span className="lt-go">{tool.soon ? "Get notified" : "Open"} &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="lab-section tone-seo">
        <span className="lab-eyebrow">What works today</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Most of it, and we say which part isn&rsquo;t.</h2>
        <div className="lab-today">
          {TODAY.map((row) => (
            <div key={row.what} className={row.live ? "live" : "next"}>
              <span className="lab-mono">{row.live ? "Live" : "Coming"}</span>
              <strong>{row.what}</strong>
              <span className="lab-muted">{row.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lab-section tone-seo">
        <div className="lab-split">
          <div>
            <span className="lab-eyebrow">Why you can trust it</span>
            <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Nothing here is made up.</h2>
            <ul className="lab-list">
              <li><span><b>Every number is measured,</b> or it says plainly that it isn&rsquo;t.</span></li>
              <li><span><b>Coverage comes first.</b> You&rsquo;re told how much was read before any score.</span></li>
              <li><span><b>A free check is an overview.</b> Connecting Google makes it fuller, and it says what changes.</span></li>
              <li><span><b>Your data stays yours.</b> Checks run in your browser, and nothing is sold.</span></li>
            </ul>
          </div>
          <div className="lab-terminal" aria-label="An example readout">
            <div className="dim">$ thymelab run seo --site example.com</div>
            <div>reading robots.txt, sitemaps ... <span className="ok">done</span></div>
            <div>pages read ........................ <span className="hi">38 of 40</span></div>
            <div>coverage stated before scores ..... <span className="ok">yes</span></div>
            <div>findings with a written fix ....... <span className="ok">all fixable ones</span></div>
            <div>speed for real visitors ........... <span className="dim">not measured without your data</span></div>
            <div className="dim" style={{ marginTop: "0.5rem" }}>example readout, for illustration</div>
          </div>
        </div>
      </section>

      <section className="lab-section tone-seo">
        <span className="lab-eyebrow">Pricing</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Start free. Pay when it&rsquo;s working for you.</h2>
        <div className="lab-tools" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <Link key={id} href={labPath("/pricing")} className="lab-tool" style={{ minHeight: 0 }}>
                <span className="lt-code">{plan.name}</span>
                <h3>{priceLabel(plan)}</h3>
                <p>{plan.blurb}</p>
                <span className="lt-go">Compare &rarr;</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="lab-section tone-seo">
        <span className="lab-eyebrow">Questions</span>
        <div style={{ marginTop: "1.2rem" }}>
          {FAQ.map((item) => (
            <details className="acc" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body"><p>{item.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      <LabCta
        title="Start with your website."
        body="Paste your address. In a few minutes you'll know what to fix first, with the fix written and waiting for your yes."
        secondary={{ href: "/", label: "Rather have it done for you?" }}
      />
    </>
  );
}
