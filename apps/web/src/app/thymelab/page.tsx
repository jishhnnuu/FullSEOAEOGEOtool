import Link from "next/link";

import { LabCta } from "@/components/lab/chrome";
import { ToolIcon } from "@/components/lab/icons";
import { LabScene } from "@/components/crew/scenes";
import { LAB, labPath } from "@/lib/brand";
import { PLANS, PLAN_ORDER, priceLabel } from "@/lib/plans";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Thymelab: the do-it-yourself marketing lab",
  description:
    "Run your own marketing experiments with the tools our agency's specialists use: SEO checks with the fixes written, competitor social teardowns, writing tests and ad budget maths. Free to start, no signup for the first run.",
  alternates: { canonical: "/thymelab" },
};

/*
 * Thymelab's front door. Written for someone who wants to do it themselves,
 * and sold separately from the agency: nothing here asks for a call. The one
 * route to the agency is a single band near the bottom, for the visitor who
 * discovers they would rather hand it over.
 */

const INSTRUMENTS = [
  {
    key: "seo" as const,
    code: "Exp 01 / SEO",
    title: "The SEO lab",
    body: "Check any website the way Google reads it. Every problem comes with the fix already written.",
    href: labPath("/seo"),
  },
  {
    key: "content" as const,
    code: "Exp 02 / Content",
    title: "The writing lab",
    body: "Measure how your pages sound against the ones you compete with, and find your own voice.",
    href: labPath("/content"),
  },
  {
    key: "social" as const,
    code: "Exp 03 / Social",
    title: "The social lab",
    body: "Study a competitor's posts. See which ones beat their usual, and what the winners share.",
    href: labPath("/social"),
  },
  {
    key: "ads" as const,
    code: "Exp 04 / Ads",
    title: "The ads lab",
    body: "Check a budget is big enough to work before you spend a penny of it.",
    href: labPath("/ads"),
  },
  {
    key: "website" as const,
    code: "Exp 05 / Website",
    title: "The website lab",
    body: "Build and launch your own website, found on Google from day one. We're building it now.",
    href: labPath("/website"),
    soon: true,
  },
];

const FAQ = [
  {
    q: `Is ${LAB} free?`,
    a: "Every instrument has a free version that needs no signup. The paid plans add bigger checks, saved history, weekly re-runs and publishing fixes straight to your website.",
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
    a: "That's our agency. Same tools, with a specialist doing the work for you.",
  },
];

export default function LabHome() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }} />

      <section className="lab-section lab-hero tone-seo">
        <div>
          <span className="lab-eyebrow">{LAB} &middot; the do-it-yourself marketing lab</span>
          <h1 className="lab-title">
            Run your own marketing <span className="glow">experiments.</span>
          </h1>
          <p className="lab-lede">
            The same tools our agency&rsquo;s specialists use, handed to you. Check your SEO, study your competitors, test
            your writing and plan your ads.
          </p>
          <div className="lab-actions">
            <Link href={labPath("/seo/audit")} className="lab-btn">Start free &rarr;</Link>
            <Link href="#instruments" className="lab-btn ghost">See the instruments</Link>
          </div>
          <div className="lab-status">
            <span>Free to start</span>
            <span>No signup for the first run</span>
            <span>Plain English</span>
          </div>
        </div>
        <LabScene />
      </section>

      <section className="lab-section tone-seo" id="instruments">
        <span className="lab-eyebrow">The instruments</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Pick an experiment.</h2>
        <div className="lab-tools">
          {INSTRUMENTS.map((tool) => (
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
        <span className="lab-eyebrow">How it works</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Three steps. No jargon.</h2>
        <div className="lab-steps">
          <div className="lab-card">
            <h3>Pick an instrument</h3>
            <p>SEO, content, social or ads. Each one does one job, properly.</p>
          </div>
          <div className="lab-card">
            <h3>Run it on any website</h3>
            <p>Yours or a competitor&rsquo;s. Results in seconds to minutes, in your browser.</p>
          </div>
          <div className="lab-card">
            <h3>Take the fixes and go</h3>
            <p>Every finding comes with what to do. Keep your runs and watch them improve.</p>
          </div>
        </div>
      </section>

      <section className="lab-section tone-seo">
        <div className="lab-split">
          <div>
            <span className="lab-eyebrow">Lab rules</span>
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
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>Start free. Upgrade when it&rsquo;s worth it.</h2>
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
        title="Your lab is ready."
        body="Start with the SEO lab: paste any website and watch it get read, checked and fixed on paper."
        secondary={{ href: "/", label: "Rather have it done for you?" }}
      />
    </>
  );
}
