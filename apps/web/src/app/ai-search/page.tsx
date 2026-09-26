import Link from "next/link";
import { CtaBand, MarketingChrome } from "@/components/marketing";
import { AI_CRAWLER_LIST } from "@/engine/robots";

export const metadata = {
  title: "AI answer visibility",
  description:
    "AEO and GEO done as work rather than a dashboard: crawler access, extractability, citable passages, entity resolution, llms.txt and the answer blocks that earn the citation.",
  alternates: { canonical: "/ai-search" },
};

const STEPS = [
  {
    n: "01",
    title: "Can the engine reach you",
    body: "Twelve named crawlers, each checked against your robots.txt individually rather than assumed from a wildcard rule. Blocking them can be the right call. Blocking them by accident is the common one.",
  },
  {
    n: "02",
    title: "Can it read what it fetched",
    body: "A page whose body arrives empty and fills in with JavaScript is invisible to any engine that does not run scripts. Measured per page, reported as a finding with the word count the server actually sent.",
  },
  {
    n: "03",
    title: "Can it resolve who you are",
    body: "Organization or LocalBusiness markup, sameAs links to the profiles that describe the same entity, consistent naming, and a presence in the records models use to disambiguate companies.",
  },
  {
    n: "04",
    title: "Is any passage worth quoting",
    body: "A direct answer in the first paragraph, a specific number in the first sentence, question headings with short answers under them, tables and lists, a named author, and outbound citations.",
  },
  {
    n: "05",
    title: "Then fix it",
    body: "The answer block is drafted. The FAQ markup is generated from the questions already on the page. The llms.txt is built from the pages worth pointing at. The entity markup is written with your real profiles in it.",
  },
];

export default function AiSearchPage() {
  return (
    <MarketingChrome>
      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />AEO and GEO</div>
        <h1 className="hero-title">Get <span className="hl">cited</span>, not just ranked.</h1>
        <p className="hero-lede">When ChatGPT or Google&rsquo;s AI answers, nobody clicks. They read who got quoted. We make you quotable.</p>
        <div className="hero-actions">
          <Link href="/thymelab/seo/checks/ai-crawler-check" className="big-button primary">Can AI read my site? &rarr;</Link>
          <Link href="/thymelab/seo/audit" className="big-button">Full audit</Link>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Four questions, then the fix.</h2>
        <p className="section-lede">
          Can the engine reach you? Can it read you? Does it know who you are? Is anything worth quoting? Then we
          fix whatever said no.
        </p>
        <details className="acc">
          <summary>The method, step by step</summary>
          <div className="acc-body">
        <div className="timeline" style={{ maxWidth: "64ch" }}>
          {STEPS.map((step) => (
            <div className="timeline-item" key={step.n}>
              <div className="timeline-when">{step.n}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
          </div>
        </details>
        <details className="acc">
          <summary>The {AI_CRAWLER_LIST.length} AI crawlers we check on every run</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
          <p>Each one is tested against your robots.txt with the same longest-match rule a real crawler uses.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>User agent</th><th>What it feeds</th></tr>
              </thead>
              <tbody>
                {AI_CRAWLER_LIST.map((agent) => (
                  <tr key={agent.agent}>
                    <td className="mono">{agent.agent}</td>
                    <td className="muted">{agent.matters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </details>
      </section>

      <section className="section">
        <h2 className="section-title">Not advice. The actual files.</h2>
        <div className="feature-grid">
          <div className="feature">
            <span className="tag">File</span>
            <h3>llms.txt, written from your site</h3>
            <p>
              Grouped by section, every entry with a one-line summary taken from the page itself. Curated down to
              the pages you would actually want quoted, not a dump of every URL.
            </p>
          </div>
          <div className="feature">
            <span className="tag">File</span>
            <h3>robots.txt with the engines you choose</h3>
            <p>
              Your existing rules kept, an explicit allow block added for the answer engines you want citations
              from, and the sitemap line added if it was missing. Marked critical risk, so a person reads it.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Markup</span>
            <h3>Entity and FAQ schema</h3>
            <p>
              Organization or LocalBusiness with the social profiles found on your own site as sameAs. FAQPage
              built from the questions already in your headings, answered from the paragraphs already under them.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Copy</span>
            <h3>Answer blocks</h3>
            <p>
              Two to three sentences that make sense quoted on their own, with the specific number first. Placed
              under the H1, above everything else, because that is the passage engines lift.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Structure</span>
            <h3>Headings that name the thing</h3>
            <p>
              &quot;Overview&quot; tells a model nothing. Generic headings are found and rewritten to say what the section
              answers, which is what decides whether a passage gets retrieved at all.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Evidence</span>
            <h3>Citable facts</h3>
            <p>
              Pages with no figures and no sources are flagged. Models cite pages that contain specific numbers,
              dates and named sources, and a page of adjectives is not one of them.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        title="Can ChatGPT even see you?"
        body="Find out in about ten seconds. Free, no account."
        primary={{ href: "/thymelab/seo/checks/ai-crawler-check", label: "Check my site" }}
      />
    </MarketingChrome>
  );
}
