import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { byCategory, CATALOG_SIZE, CATEGORY_LABEL } from "@/engine/catalog";

export const metadata = {
  title: "The platform",
  description:
    "Every check the audit runs, every fix it generates, and the departments the work is organised into. Technical, content, schema, AI answers, local, off page, compliance and measurement.",
  alternates: { canonical: "/platform" },
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

const MISSIONS = [
  {
    key: "onboard",
    name: "Onboard a site",
    cadence: "Once, when you add a site",
    body: "Full crawl, the whole catalogue, the topic model, the gap analysis and the first set of briefs. This is the run that replaces the audit an agency charges for.",
  },
  {
    key: "weekly",
    name: "Weekly growth cycle",
    cadence: "Every week",
    body: "Re-crawl what changed, close the findings that were fixed, catch new ones, refresh the content queue and report the difference against last week.",
  },
  {
    key: "fix",
    name: "Fix and publish",
    cadence: "On approval",
    body: "Take approved changes and apply them: through the CMS where one is connected, as a webhook payload, a pull request or plain text where one is not.",
  },
  {
    key: "content",
    name: "Content production",
    cadence: "On your publishing cadence",
    body: "Brief, draft, run the quality gates, route to review. A draft that fails a gate never reaches the queue.",
  },
  {
    key: "aeo",
    name: "AI answer tracking",
    cadence: "Weekly",
    body: "Crawler access, extractability, citable passages and entity strength. Flags factual assertions engines make about you for checking against your own facts.",
  },
  {
    key: "local",
    name: "Local cycle",
    cadence: "Weekly",
    body: "Profile completeness, this week's post, replies to every new review, citation consistency and geo grid position.",
  },
  {
    key: "links",
    name: "Link building",
    cadence: "Continuous",
    body: "Prospect, qualify, draft something that references what the recipient actually published, send from your domain under a cap, and stop the moment somebody replies.",
  },
  {
    key: "report",
    name: "Monthly report",
    cadence: "Monthly",
    body: "What was done, what it cost, what moved and what is next. Written as a narrative, with the trace behind every claim.",
  },
];

export default function PlatformPage() {
  const catalogue = byCategory();
  const categories = Object.entries(catalogue).sort((a, b) => b[1].length - a[1].length);

  return (
    <MarketingChrome>
      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Under the hood</div>
        <h1 className="hero-title">{CATALOG_SIZE} checks. <span className="hl">Every</span> one explained.</h1>
        <p className="hero-lede">Our whole method, in the open. Agencies call this their secret framework.</p>
        <div className="hero-actions">
          <Link href="/thymelab/seo/audit" className="big-button primary">Run them on my site &rarr;</Link>
          <Link href="/library" className="big-button">Browse every check</Link>
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title">Work that runs itself.</h2>
        <p className="section-lede">Missing a connection? The step says what it needs and the rest carries on.</p>
        <div className="feature-grid">
          {MISSIONS.map((mission) => (
            <div className="feature" key={mission.key}>
              <span className="tag">{mission.cadence}</span>
              <h3>{mission.name}</h3>
              <p>{mission.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div>
          <h2 className="section-title">Every check, by category.</h2>
          <p className="section-lede">
            &ldquo;Fix generated&rdquo; means the finished change comes attached. The rest come with clear guidance.
          </p>

          {categories.map(([category, checks]) => (
            <details className="acc" key={category}>
              <summary>
                {CATEGORY_LABEL[category] ?? category}
                <span className="faint small"> {checks.length} checks</span>
              </summary>
              <div className="table-scroll acc-body" style={{ maxWidth: "none" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Why it matters</th>
                      <th>Severity</th>
                      <th className="num">Impact</th>
                      <th className="num">Effort</th>
                      <th>Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...checks]
                      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
                      .map((check) => (
                        <tr key={check.code}>
                          <td>
                            <strong>{check.title}</strong>
                            <div className="tiny faint mono">{check.code}</div>
                          </td>
                          <td className="small muted">{check.why}</td>
                          <td><span className={`badge badge-${check.severity}`}>{check.severity}</span></td>
                          <td className="num">{check.impact.toFixed(2)}</td>
                          <td className="num">{check.effort.toFixed(2)}</td>
                          <td className="small">
                            {check.autoFixable ? <span className="badge badge-ok">fix generated</span> : <span className="faint">guidance</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Five levels of hands-off.</h2>
        <p className="section-lede">Pick how much ships without you. The risky stuff always waits, whatever you pick.</p>
        <details className="acc">
          <summary>What each level ships on its own</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Level</th>
                <th>Ships on its own</th>
                <th>Always waits for you</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>Observe</strong></td><td className="muted">Nothing. Audit and report only</td><td>Everything</td></tr>
              <tr><td><strong>Propose</strong></td><td className="muted">Nothing, but everything is queued and ready</td><td>Everything</td></tr>
              <tr><td><strong>Assist</strong></td><td>Low-risk reversible fixes, after a delay you set</td><td>Content, outreach, anything site-wide</td></tr>
              <tr><td><strong>Operate</strong></td><td>Technical fixes and schema</td><td>Content, outreach, anything site-wide</td></tr>
              <tr><td><strong>Autopilot</strong></td><td>Everything reversible</td><td>Content, outreach, anything irreversible or site-wide</td></tr>
            </tbody>
          </table>
        </div>
        <div className="notice notice-warn" style={{ marginTop: "1.2rem", maxWidth: "70ch" }}>
          No level auto-approves a critical action. robots.txt changes, redirect rules across the site and
          anything that cannot be undone need a person, and that is not configurable.
        </div>
          </div>
        </details>
      </section>

      <section className="section section-alt">
        <div>
          <h2 className="section-title">Works with nothing connected.</h2>
          <p className="section-lede">
            No twelve login screens before you see anything. Each connection adds a bit more, and the dashboard
            says exactly what.
          </p>
          <p><Link href="/how-it-works#connections" className="fresh-btn ghost">What each connection adds &rarr;</Link></p>
        </div>
      </section>

      <CtaBand />
    </MarketingChrome>
  );
}
