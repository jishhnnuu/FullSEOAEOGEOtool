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
      <section className="section">
        <div className="eyebrow">The platform</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          {CATALOG_SIZE} checks, and the work that follows each one.
        </h1>
        <p className="section-lede">
          Severity, impact, effort and confidence live in one table rather than inside the checks, so the same
          problem is scored the same way wherever it is found and you can argue with the inputs. Below is the
          whole methodology. An agency calls this document its audit framework and does not show it to you.
        </p>
      </section>

      <section className="section section-tight">
        <div className="eyebrow">Missions</div>
        <h2 className="section-title">Work that runs on a schedule.</h2>
        <p className="section-lede">
          A mission is a sequence of steps with agents attached. Steps that cannot run say what would unblock them
          rather than failing the run, which is why a site with nothing connected still gets a full audit.
        </p>
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
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">The catalogue</div>
          <h2 className="section-title">Every check, with what it costs you.</h2>
          <p className="section-lede">
            Anything marked <strong>fix generated</strong> arrives with the corrected artefact attached: the tag,
            the JSON-LD, the file, the link plan or the copy. Everything else arrives with the specific
            recommendation and the evidence behind it.
          </p>

          {categories.map(([category, checks]) => (
            <details className="reveal" key={category} style={{ marginBottom: "0.5rem" }} open={category === "technical"}>
              <summary>
                {CATEGORY_LABEL[category] ?? category}
                <span className="faint small"> {checks.length} checks</span>
              </summary>
              <div className="table-scroll">
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
        <div className="eyebrow">Control</div>
        <h2 className="section-title">Five autonomy levels, and one rule none of them override.</h2>
        <p className="section-lede">
          Most tools give you a choice between approving everything, so nothing ships, and approving nothing, so
          you lose control. Neither is what anyone wants.
        </p>
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
      </section>

      <section className="section section-alt">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">Connections</div>
          <h2 className="section-title">Nothing is gated. Everything degrades with a reason.</h2>
          <p className="section-lede">
            Most tools are useless until everything is connected, so onboarding becomes twelve OAuth screens before
            anyone has seen value. The audit here runs on the public site alone. Each connection turns a stated
            limitation into a capability, and the dashboard says exactly which.
          </p>
          <p><Link href="/how-it-works#connections">What each connection unlocks</Link></p>
        </div>
      </section>

      <CtaBand />
    </MarketingChrome>
  );
}
