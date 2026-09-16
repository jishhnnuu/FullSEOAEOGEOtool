"use client";

/**
 * Internal linking, executed rather than recommended.
 *
 * Two different problems wearing the same name. A section with nothing linking
 * into it does not need twelve contextual links, it needs the index page
 * somebody forgot to build, and that page is written here in full. A single
 * page nobody points at needs a link from prose that is already about the same
 * thing, and that sentence is found and rewritten here rather than described.
 *
 * Nothing on this screen ends in "and now add some internal links".
 */

import Link from "next/link";
import { useMemo } from "react";

import { Card, CopyButton, Empty, Notice, PageHeader, shortUrl } from "@/components/ui";
import { useSite } from "@/lib/site-hooks";
import { planContextualLinks, planListings } from "@/engine/internal-links";

export default function LinkingPage() {
  const { site, result } = useSite();

  const plans = useMemo(() => {
    if (!result) return { listings: [], contextual: [] };

    const orphanFinding = result.findings.find((f) => f.code === "orphan_page");
    const orphans = orphanFinding?.affectedUrls ?? [];
    const listings = planListings(result.crawl, orphans);

    // Pages a listing will not reach: thin in-links, real content, worth a
    // sentence somewhere. Capped, because a hundred proposals is a backlog.
    const covered = new Set(listings.flatMap((plan) => plan.entries.map((entry) => entry.url)));
    const targets = result.crawl.pages
      .filter((page) => page.status === 200 && page.depth > 0 && page.inlinks.length < 2 && !covered.has(page.url))
      .sort((a, b) => (b.signals?.wordCount ?? 0) - (a.signals?.wordCount ?? 0))
      .slice(0, 15)
      .map((page) => page.url);

    return { listings, contextual: planContextualLinks(result.crawl, targets, { maxPerTarget: 2 }) };
  }, [result]);

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Internal linking" />
        <Empty title="No run yet">
          <p className="small">
            <Link href={`/app/sites/${site.id}`}>Run the audit</Link> first. Internal linking is worked out from the
            crawl, not guessed.
          </p>
        </Empty>
      </>
    );
  }

  const { listings, contextual } = plans;

  return (
    <>
      <PageHeader
        title="Internal linking"
        description="The pages nothing points at, and the two different fixes that follow. One is a page that should exist. The other is a sentence that should carry a link."
      />

      {listings.length === 0 && contextual.length === 0 ? (
        <Notice kind="ok" title="Nothing to do here">
          Every page in the crawl has something linking to it, and no section is missing its index. That is unusual and
          it is worth keeping: the next run will say if it stops being true.
        </Notice>
      ) : null}

      {listings.length > 0 ? (
        <>
          <Notice kind="warn" title={`${listings.length} section${listings.length === 1 ? "" : "s"} with no index page`}>
            Each one below fixes several orphans at once, because the cause is one missing page rather than several
            missing links. The page is written out in full: copy the HTML into a new page at the URL given, publish it,
            and link to it from the navigation.
          </Notice>

          {listings.map((plan) => (
            <Card key={plan.section} title={plan.title}>
              <dl className="kv">
                <dt>Publish at</dt>
                <dd className="mono">{plan.url}</dd>
                <dt>Fixes</dt>
                <dd>
                  {plan.fixes} orphaned page{plan.fixes === 1 ? "" : "s"} in {plan.section}
                </dd>
                <dt>Link to it from</dt>
                <dd className="small">{plan.linkFrom.join(", ") || "the main navigation"}</dd>
                <dt>Meta description</dt>
                <dd className="small">{plan.metaDescription}</dd>
              </dl>

              <details className="reveal" style={{ marginTop: "0.8rem" }}>
                <summary className="small">The {plan.entries.length} pages it lists</summary>
                <ul className="small stack-sm" style={{ paddingLeft: "1.1rem" }}>
                  {plan.entries.map((entry) => (
                    <li key={entry.url}>
                      <strong>{entry.title}</strong>
                      {entry.summary ? <span className="muted"> {entry.summary}</span> : null}
                      <div className="tiny faint mono">{shortUrl(entry.url, 70)}</div>
                    </li>
                  ))}
                </ul>
              </details>

              <details className="reveal">
                <summary className="small">The page itself, ready to publish</summary>
                <pre className="codeblock">{plan.html}</pre>
              </details>

              <details className="reveal">
                <summary className="small">The structured data that goes with it</summary>
                <pre className="codeblock">{JSON.stringify(plan.jsonLd, null, 2)}</pre>
              </details>

              <div className="button-row" style={{ marginTop: "0.8rem" }}>
                <CopyButton text={plan.html} label="Copy the page" />
                <CopyButton text={JSON.stringify(plan.jsonLd, null, 2)} label="Copy the markup" />
              </div>
            </Card>
          ))}
        </>
      ) : null}

      <Card title={`Sentences that should carry a link · ${contextual.length}`}>
        <p className="small muted">
          Each of these is a sentence that already exists on your site and already names what the target page is about.
          The rewritten version is the same sentence with the link in place, nothing else changed. Where no such
          sentence exists, nothing is proposed: inserting a link would mean writing a sentence, and that is a content
          change rather than a linking change.
        </p>

        {contextual.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Nothing to propose. Either every thin page is covered by a listing above, or no page on the site talks about
            them in prose yet, which is a content gap rather than a linking one.
          </p>
        ) : (
          <div className="stack">
            {contextual.map((link, index) => (
              <div className="draft" key={`${link.fromUrl}-${link.toUrl}-${index}`}>
                <div className="small">
                  <span className="mono tiny">{shortUrl(link.fromUrl, 48)}</span> should link to{" "}
                  <span className="mono tiny">{shortUrl(link.toUrl, 48)}</span>
                </div>
                <p className="tiny faint" style={{ marginTop: "0.3rem" }}>
                  {link.why} Confidence {Math.round(link.confidence * 100)}%.
                </p>
                <div className="rule-label">Now</div>
                <pre>{link.sentence}</pre>
                <div className="rule-label">After</div>
                <pre>{link.after}</pre>
                <div className="button-row">
                  <CopyButton text={link.after} label="Copy the rewritten sentence" />
                  <a href={link.fromUrl} target="_blank" rel="noopener noreferrer" className="button small">
                    Open the page
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Why this is two problems and not one">
        <p className="small muted" style={{ marginBottom: 0 }}>
          A crawl that reports twenty-one orphans and asks you to fix twenty-one pages has diagnosed the symptom. When
          most of them sit in one section, the cause is that the section has no index, and building it fixes all of them
          in one publish. The rest are genuinely individual, and those get a sentence each. Treating both the same way
          is how internal linking becomes a permanent backlog item nobody ever finishes.
        </p>
      </Card>
    </>
  );
}
