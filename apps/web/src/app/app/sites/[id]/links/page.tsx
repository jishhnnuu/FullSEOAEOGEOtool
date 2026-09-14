"use client";

import Link from "next/link";
import { useState } from "react";

import type { LinkProspect } from "@/engine/types";
import { useSite } from "@/lib/site-hooks";
import { Badge, Card, CopyButton, Empty, Notice, PageHeader } from "@/components/ui";

export default function LinksPage() {
  const { site, result } = useSite();
  const [kind, setKind] = useState("all");

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Links" />
        <Empty title="No run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Run the audit</Link> first.</p>
        </Empty>
      </>
    );
  }

  const prospects = result.prospects.filter((p) => kind === "all" || p.kind === kind);
  const hasIndex = site.integrations.some(
    (i) => i.status === "connected" && ["gsc", "dataforseo", "ahrefs"].includes(i.provider),
  );
  const noAsset = result.findings.find((f) => f.code === "no_linkable_asset");

  return (
    <>
      <PageHeader
        title="Authority and links"
        description="Prospects the crawl can see from the site itself: entity records you are missing, sites you already cite, and the competitors whose link sources are worth working."
      />

      {!hasIndex && (
        <Notice kind="warn">
          <strong>No link data source is connected.</strong> The crawl can read your site but not the web&apos;s link
          graph, so nothing here is a measurement of your backlink profile. Connect{" "}
          <Link href={`/app/sites/${site.id}/integrations`}>Search Console</Link> for a free sample of referring
          domains, or a link index for the full set.
        </Notice>
      )}

      {noAsset && (
        <Notice kind="bad">
          <strong>Nothing on the site is worth linking to.</strong> {noAsset.why} Outreach without an asset is
          begging, and it fails. The content plan has a data piece briefed for exactly this;{" "}
          <Link href={`/app/sites/${site.id}/content`}>it is in the queue</Link>.
        </Notice>
      )}

      <div className="row" style={{ marginBottom: "1rem" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: "auto" }}>
          <option value="all">Every kind</option>
          <option value="directory">Entity records and directories</option>
          <option value="partner">Sites you already cite</option>
          <option value="competitor_link">Competitor link sources</option>
          <option value="resource_page">Resource pages</option>
          <option value="unlinked_mention">Unlinked mentions</option>
        </select>
      </div>

      {prospects.length === 0 ? (
        <Empty title="No prospects of that kind" />
      ) : (
        <div className="stack-sm">
          {prospects.map((prospect) => (
            <details className="reveal" key={`${prospect.kind}-${prospect.domain}`}>
              <summary>
                <span className="row" style={{ gap: "0.5rem", display: "inline-flex" }}>
                  <Badge kind={prospect.priority >= 85 ? "high" : prospect.priority >= 70 ? "medium" : "low"}>
                    {prospect.priority}
                  </Badge>
                  <strong>{prospect.domain}</strong>
                  <span className="faint small">{prospect.kind.replace(/_/g, " ")}</span>
                </span>
              </summary>
              <div className="stack-sm">
                <p className="small muted" style={{ margin: 0 }}>{prospect.why}</p>
                <dl className="kv small">
                  <dt>Authority</dt><dd>{prospect.authorityHint}</dd>
                  <dt>How to reach them</dt><dd>{prospect.contactPath}</dd>
                </dl>
                <div className="notice small">
                  <strong>The angle.</strong> {prospect.pitchAngle}
                </div>
                <div className="button-row">
                  <a href={prospect.url} target="_blank" rel="noopener noreferrer" className="button small">Open</a>
                  <CopyButton text={outreachDraft(prospect, site.name, site.domain)} label="Copy an outreach draft" />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      <Card title="How outreach works here">
        <ul className="small muted" style={{ paddingLeft: "1.1rem", marginBottom: 0 }}>
          <li>Email is sent from your domain through your own provider, never through platform infrastructure. A shared sending domain gets burned by somebody else&apos;s campaign and takes your deliverability with it.</li>
          <li>There is a per-domain daily cap, and it is not adjustable upward past what a person could plausibly send.</li>
          <li>The drafting tool refuses role addresses, template outreach, and anything with no substantive reference to what the recipient actually published.</li>
          <li>Follow-ups stop the moment somebody replies.</li>
          <li>Every send waits for your approval regardless of autonomy level.</li>
        </ul>
      </Card>
    </>
  );
}

function outreachDraft(prospect: LinkProspect, brand: string, domain: string): string {
  return [
    `Subject: [REPLACE: reference something specific they published]`,
    ``,
    `Hi [REPLACE: their first name],`,
    ``,
    `[REPLACE: one sentence about the specific piece of theirs you read, with what you took from it. If you cannot write this sentence honestly, do not send the email.]`,
    ``,
    `I work on ${brand} (${domain}). ${prospect.pitchAngle}`,
    ``,
    `[REPLACE: the specific thing you are offering: the data, the quote, the correction. One sentence.]`,
    ``,
    `Either way, thanks for [REPLACE: the thing you actually found useful].`,
    ``,
    `[Your name]`,
    ``,
    `---`,
    `Checklist before this goes out:`,
    `- Is it addressed to a person, not info@ or hello@?`,
    `- Does the first line reference something only somebody who read their work would know?`,
    `- Are you offering something before you ask for anything?`,
    `- Would you reply to this?`,
  ].join("\n");
}
