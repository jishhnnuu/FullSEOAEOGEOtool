"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { LinkProspect } from "@/engine/types";
import { useSite } from "@/lib/site-hooks";
import { LinkLimits, LinkVerifier, TacticPlan } from "@/components/link-verify";
import { LinkProgramme } from "@/components/link-programme";
import { OutreachDesk } from "@/components/outreach-desk";
import { loadLinks } from "@/lib/links";
import type { Mention } from "@/engine/mentions";
import { useWorkspace } from "@/lib/useWorkspace";
import type { AnswerVisibility } from "@/engine/answers";
import { Badge, Card, CopyButton, Empty, Notice, PageHeader } from "@/components/ui";

export default function LinksPage() {
  const { site, result } = useSite();
  const [workspace] = useWorkspace();
  const [kind, setKind] = useState("all");
  const [mentions, setMentions] = useState<Mention[]>([]);

  useEffect(() => {
    if (site) setMentions(loadLinks(site.id).mentions);
  }, [site]);

  // The answer visibility run drives the mention targets and the asset ideas,
  // because the questions we lost are the best evidence of demand available.
  const visibility = (workspace.visibility.find((v) => v.siteId === site?.id)?.latest ?? null) as AnswerVisibility | null;

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

      {/*
        * Verification first, because it is the one part of link building that
        * is nearly always done wrong and the one this can do exactly.
        */}
      <LinkProgramme site={site} visibility={visibility} />

      <LinkVerifier targetDomain={site.domain} />

      {/*
        * The desk. Everything above finds and judges prospects; this writes the
        * email and opens it, which is the part that used to be the founder's
        * evening.
        */}
      <OutreachDesk
        site={site}
        prospects={result.prospects}
        mentions={mentions}
        accountName={workspace.account?.name ?? ""}
      />

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
                  <span className="tiny faint">The written draft for this one is at the top of the page.</span>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      <Card title="How outreach works here">
        <ul className="small muted" style={{ paddingLeft: "1.1rem", marginBottom: 0 }}>
          <li>Email goes out from your own account, in your own mail client. Nothing passes through this platform, so a shared sending domain cannot be burned by somebody else&apos;s campaign and take your deliverability with it.</li>
          <li>Two approaches per domain per month, one follow-up, and the sequence stops the moment somebody replies.</li>
          <li>A draft is refused outright unless it can quote something from the recipient&apos;s own page. There are no placeholders to fill in, because a draft with placeholders is a template.</li>
          <li>Shared mailboxes are flagged rather than used.</li>
          <li>Nothing sends itself, at any autonomy level. A compose window opens and you press send.</li>
        </ul>
      </Card>
      <TacticPlan />

      <LinkLimits />
    </>
  );
}
