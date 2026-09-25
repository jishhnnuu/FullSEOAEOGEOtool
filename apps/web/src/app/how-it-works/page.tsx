import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { CATEGORY_LABEL, CONNECTORS } from "@/lib/connectors";
import { AUTONOMY_LEVELS } from "@/lib/store";

export const metadata = {
  title: "How it works",
  description:
    "What happens between entering a URL and a change going live: the crawl, the checks, the fixes, the approval queue, publishing and the report that compares this run to the last.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  const byCategory = CONNECTORS.reduce<Record<string, typeof CONNECTORS>>((acc, connector) => {
    (acc[connector.category] ??= []).push(connector);
    return acc;
  }, {});

  return (
    <MarketingChrome>
      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />How it works</div>
        <h1 className="hero-title">From URL to <span className="hl">fixed.</span></h1>
        <p className="hero-lede">Paste a URL. We read it, write the fixes, you click yes, we ship them. That&rsquo;s it.</p>
        <div className="hero-actions">
          <Link href="/app/new" className="big-button primary">Try it on my site &rarr;</Link>
          <Link href="/inside" className="big-button">Watch a live one</Link>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">The short version.</h2>
        <div className="steps3" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>We read everything</h3>
            <p>Your robots.txt, sitemaps and every page. Then every check we have.</p>
          </div>
          <div>
            <h3>We write the fixes</h3>
            <p>Titles, descriptions, schema, links, briefs. The actual change, not advice.</p>
          </div>
          <div>
            <h3>You say yes, we ship</h3>
            <p>Straight to your CMS. Next run tells you what changed.</p>
          </div>
        </div>
        <details className="acc" style={{ marginTop: "1.8rem" }}>
          <summary>The long version, all nine steps</summary>
          <div className="acc-body">
              <div className="timeline" style={{ maxWidth: "66ch" }}>
                <div className="timeline-item">
                  <div className="timeline-when">Step 1</div>
                  <h3>You give it an address</h3>
                  <p>
                    And, optionally, context that sharpens everything after it: what kind of business this is, where it
                    operates, who it competes with, and the terms you want to win. None of it is required.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 2</div>
                  <h3>It reads the site&apos;s own instructions first</h3>
                  <p>
                    robots.txt, the sitemaps named in it and the ones at the usual paths, and llms.txt. The AI crawler
                    verdict is decided here, before a single page is fetched.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 3</div>
                  <h3>It crawls</h3>
                  <p>
                    Breadth first from the homepage, with sitemap URLs entering at the same depth as navigation links so
                    orphan pages surface rather than being starved. robots.txt is honoured. Redirect chains, status
                    codes, response times and payload sizes are all recorded on the way through.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 4</div>
                  <h3>The catalogue runs</h3>
                  <p>
                    Per page and across the site: duplication, cannibalisation, orphans, sitemap accuracy, entity
                    signals. Each finding gets a priority from impact times confidence over effort, scaled by how many
                    pages it touches, so the list is ordered by what is worth doing rather than by severity alone.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 5</div>
                  <h3>The fixes get written</h3>
                  <p>
                    Titles from the page&apos;s own topic. Meta descriptions from its own opening. JSON-LD from what it
                    contains. Sitemaps from the URLs that were reachable and indexable. Link plans from pages that
                    already discuss the target. Alt text from filenames and page context, with a warning to read it.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 6</div>
                  <h3>Strategy, not just repairs</h3>
                  <p>
                    A keyword model built with tf-idf over your own copy, weighted towards titles and headings. Gaps
                    against your competitors, your locations and the terms you named. Briefs with outlines, answer
                    blocks, FAQs, internal links, meta and schema.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 7</div>
                  <h3>You approve</h3>
                  <p>
                    Batched by risk, each item showing what it changes, why, what it is expected to do and whether it can
                    be undone. High and critical items cannot be bulk approved, deliberately.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 8</div>
                  <h3>It ships, or it hands you the exact change</h3>
                  <p>
                    Through your CMS where one is connected. As a webhook payload, a patch or plain text where one is
                    not. Either way the change is recorded against the agent that proposed it and the person who
                    approved it.
                  </p>
                </div>
                <div className="timeline-item">
                  <div className="timeline-when">Step 9</div>
                  <h3>The next run reports the difference</h3>
                  <p>
                    What cleared, what appeared, what got worse, which pages changed, which way the scores moved. That
                    comparison is the thing an agency retainer is supposed to produce and rarely does.
                  </p>
                </div>
              </div>
          </div>
        </details>
      </section>

      <section className="section" id="connections">
        <div>
          <h2 className="section-title">Plug things in. Or don&rsquo;t.</h2>
          <p className="section-lede">
            Connect nothing and you still get the full audit, the fixes and the content plan. Each connection just
            adds a bit more.
          </p>
          {Object.entries(byCategory).map(([category, connectors]) => (
            <details className="acc" key={category}>
              <summary>{CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]} ({connectors.length})</summary>
              <div className="acc-body" style={{ maxWidth: "none" }}>
              <div className="feature-grid">
                {connectors.map((connector) => (
                  <div className="feature" key={connector.provider}>
                    <span className="tag">{connector.essential ? "Recommended" : "Optional"}</span>
                    <h3>{connector.name}</h3>
                    <p style={{ marginBottom: "0.6rem" }}>{connector.summary}</p>
                    <ul className="small muted" style={{ margin: "0 0 0.6rem", paddingLeft: "1.1rem" }}>
                      {connector.unlocks.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p className="tiny faint" style={{ margin: 0 }}>
                      <strong>Without it:</strong> {connector.withoutIt}
                    </p>
                  </div>
                ))}
              </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">You choose how hands-on.</h2>
        <p className="section-lede">From &ldquo;ask me everything&rdquo; to autopilot. Some things always need you, whatever you pick.</p>
        <details className="acc">
          <summary>The autonomy levels</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Level</th><th>What it means</th></tr></thead>
            <tbody>
              {AUTONOMY_LEVELS.map((level) => (
                <tr key={level.key}>
                  <td><strong>{level.label}</strong></td>
                  <td className="muted">{level.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: "1rem", maxWidth: "70ch" }}>
          Content written in your voice and outreach sent from your domain wait for a person at every level,
          including autopilot. That is not a default you can change. See{" "}
          <Link href="/security">how data and credentials are handled</Link>.
        </p>
          </div>
        </details>
      </section>

      <CtaBand />
    </MarketingChrome>
  );
}
