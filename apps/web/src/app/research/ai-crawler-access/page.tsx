import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { METHOD, RESEARCH, SAMPLE_DESCRIPTION, headlines } from "@/content/research";
import { articleNode, breadcrumbNode, faqNode, graph } from "@/lib/schema";

const { summary, sites } = RESEARCH;

export const metadata = {
  title: `We measured ${summary.sampled} SaaS sites for AI crawler access. ${summary.names_no_agent_explicitly.pct}% name no crawler at all`,
  description:
    `An original dataset: crawler access, llms.txt adoption, structured data and extractability across ${summary.sampled} well-known SaaS companies, measured from public files. Method and per-site results included.`,
  alternates: { canonical: "/research/ai-crawler-access" },
};

const FAQ = [
  {
    q: "How was this measured?",
    a: "Two public requests per domain: robots.txt and the homepage. Crawler access is read from robots.txt for the six retrieval agents that decide whether a brand appears in an AI answer. Everything else is read from the HTML the server returned before any JavaScript ran, because that is what a retrieval crawler receives.",
  },
  {
    q: "Is this a random sample?",
    a: "No, and it is not a ranking either. It is a convenience sample of well-known SaaS, developer-tool and marketing-tool companies. The argument for it is that these are well-resourced sites whose patterns get copied, so problems here are a floor rather than a ceiling.",
  },
  {
    q: "Why does the percentage not divide by 100?",
    a: `Ten of the hundred sampled sites refused the crawler outright with a 403, 429 or 400. Every rate on this page divides by the ${summary.reachable} that answered, and that number is stated next to each one.`,
  },
  {
    q: "Can I reproduce this?",
    a: "Yes, and that is the point. The script is in the repository, the sample list is a plain text file next to it, and every measurement is two public requests anyone can make from a browser or a terminal.",
  },
  {
    q: "Why can you afford to publish this when nobody else does?",
    a: "Because the audit uses no language model and no data vendor, so a run costs bandwidth and nothing else. Every competitor measuring the same thing pays a model call or a data credit per site. That is an architecture difference before it is a marketing one.",
  },
];

const blockers = sites.filter((s) => s.blocked_agents.length > 0);
const thinnest = sites
  .filter((s) => s.reachable)
  .sort((a, b) => a.words - b.words)
  .slice(0, 8);
const refused = sites.filter((s) => !s.reachable);

export default function ResearchPage() {
  const cards = headlines(summary);
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "AI crawler access study", path: "/research/ai-crawler-access" },
            ]),
            articleNode({
              headline: `AI crawler access across ${summary.sampled} SaaS sites`,
              description: `Original measurement of crawler access, llms.txt adoption, structured data and extractability across ${summary.sampled} well-known SaaS companies.`,
              path: "/research/ai-crawler-access",
              published: summary.generated_at,
            }),
            faqNode(FAQ),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">Original research · {summary.generated_at}</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          We measured {summary.sampled} SaaS sites for AI crawler access.
        </h1>
        {/* Claim, denominator and the surprise, in the first paragraph. */}
        <p className="section-lede">
          Almost nobody blocks AI crawlers on purpose: only {summary.blocking_any_retrieval_agent.count} of the{" "}
          {summary.reachable} sites that answered disallow a retrieval agent. The problems are quieter.{" "}
          {summary.names_no_agent_explicitly.pct}% name no AI crawler at all, {summary.no_organization_entity.pct}%
          publish no Organization entity, and {summary.thin_served_html.pct}% serve under 200 words before
          JavaScript runs. Ten refused this crawler outright.
        </p>
      </section>

      <section className="section section-tight">
        <div className="card-grid">
          {cards.map((card) => (
            <div className="card" key={card.claim}>
              <div className="research-stat">{card.stat}</div>
              <h3 style={{ marginTop: "0.2rem" }}>{card.claim}</h3>
              <p className="small muted">{card.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The sample, stated before the conclusions</h2>
        <p>{SAMPLE_DESCRIPTION}</p>
        <p>
          Of {summary.sampled} domains, {summary.reachable} answered and {summary.unreachable} did not. Every
          percentage on this page divides by {summary.reachable}, and that is worth repeating because a rate over
          an unstated denominator is the single most common way a study of this kind misleads.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Method</h2>
        <ul className="prose-list">
          {METHOD.map((line) => (
            <li key={line.slice(0, 40)}>{line}</li>
          ))}
        </ul>
        <p className="small muted">
          The fourth point is the one worth dwelling on. A first pass of this study reported that 70% of the sample
          published an llms.txt, which would have been a striking headline and a wrong one: plenty of sites answer
          200 with an HTML shell at any path, and one answered 403 to a browser and 200 to this client within the
          same minute. Requiring a text/plain response and a Markdown heading moved the real figure to{" "}
          {summary.has_llms_txt.pct}%. A false positive is more expensive than a miss, and in published research it
          is fatal.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Who actually blocks a retrieval crawler</h2>
        <p>
          {blockers.length} sites in the sample disallow at least one of the six agents from the root. The pattern is
          consistent: companies whose product is the content or the canvas itself.
        </p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Agents disallowed from /</th>
              </tr>
            </thead>
            <tbody>
              {blockers.map((site) => (
                <tr key={site.domain}>
                  <td><code>{site.domain}</code></td>
                  <td className="small">{site.blocked_agents.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The homepages a crawler sees as almost blank</h2>
        <p>
          None of the major AI retrieval crawlers executes JavaScript. These are the word counts in the HTML the
          server actually returned, which is the whole of what those crawlers receive. The median across the sample
          is {summary.median_served_words} words.
        </p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Site</th>
                <th className="num">Words served</th>
                <th className="num">JSON-LD blocks</th>
              </tr>
            </thead>
            <tbody>
              {thinnest.map((site) => (
                <tr key={site.domain}>
                  <td><code>{site.domain}</code></td>
                  <td className="num"><strong>{site.words}</strong></td>
                  <td className="num muted">{site.jsonld_blocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          A low number here is not proof that a company is invisible in AI answers. It means the homepage carries
          almost nothing an answer engine can quote, and that whatever authority the brand has is being earned
          somewhere other than its own front page.{" "}
          <Link href="/ai-crawlers-and-javascript">The measurement behind the JavaScript claim</Link> is a separate
          page, with the sources.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The sites that refused</h2>
        <p>
          {refused.length} of {summary.sampled} answered 403, 429 or 400 to a plain, identified, rate-limited
          request at a delay of well under one request per second. They are listed because excluding them silently
          would change every percentage on this page without saying so.
        </p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Site</th>
                <th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {refused.map((site) => (
                <tr key={site.domain}>
                  <td><code>{site.domain}</code></td>
                  <td className="num">{site.status === 0 ? "no response" : site.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Every measurement, per site</h2>
        <p className="small muted">
          All {summary.sampled} domains, in the order they were read. Anyone can reproduce a row with two requests.
        </p>
        <div className="table-scroll">
          <table className="compare-table research-table">
            <thead>
              <tr>
                <th>Site</th>
                <th className="num">Words</th>
                <th className="num">JSON-LD</th>
                <th>Org entity</th>
                <th>llms.txt</th>
                <th>Names agents</th>
                <th>Blocks</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.domain}>
                  <td><code>{site.domain}</code></td>
                  <td className="num">{site.reachable ? site.words : <span className="muted">{site.status || "n/a"}</span>}</td>
                  <td className="num">{site.reachable ? site.jsonld_blocks : ""}</td>
                  <td>{site.has_organization ? <span className="yes">Yes</span> : <span className="no">No</span>}</td>
                  <td>{site.has_llms_txt ? <span className="yes">Yes</span> : <span className="no">No</span>}</td>
                  <td className="num">{site.names_agents}</td>
                  <td className="small">{site.blocked_agents.length ? site.blocked_agents.length : <span className="muted">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Questions</h2>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand
        title="Run the same measurements on your own site"
        body="The crawler access check and the extractability check are free, need no account, and use the same engine that produced this dataset."
        primary={{ href: "/tools/ai-crawler-check", label: "Check my site" }}
      />
    </MarketingChrome>
  );
}
