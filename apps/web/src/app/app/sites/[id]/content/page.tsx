"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ContentBrief } from "@/engine/types";
import { briefFor } from "@/engine/strategy";
import { optionsFor } from "@/lib/runner";
import { defaultVoice, writeDraft } from "@/engine/writer";
import { id, logActivity, type ContentRecord } from "@/lib/store";
import { useSite } from "@/lib/site-hooks";
import {
  Badge,
  Card,
  CopyButton,
  Empty,
  Markdown,
  Notice,
  PageHeader,
  Tabs,
  formatNumber,
  timeAgo,
} from "@/components/ui";

type View = "plan" | "drafts";

export default function ContentPage() {
  const { site, result, workspace, mutate } = useSite();
  const [view, setView] = useState<View>("plan");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(
    () => workspace.content.filter((c) => c.siteId === site?.id),
    [workspace.content, site?.id],
  );

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Content" />
        <Empty title="No run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Run the audit</Link> and the plan is built from the gaps it finds.</p>
        </Empty>
      </>
    );
  }

  const hasKey = !!workspace.model?.apiKey;

  async function draft(brief: ContentBrief) {
    if (!site) return;
    setBusy(brief.id);
    setError(null);
    const voice = defaultVoice(site.name, site.domain, site.industry || null, site.locations[0] ?? null);
    try {
      const written = await writeDraft(brief, voice, workspace.model);
      const record: ContentRecord = {
        id: id("con"),
        siteId: site.id,
        briefId: brief.id,
        title: brief.title,
        slug: brief.slug,
        format: brief.format,
        targetKeyword: brief.targetKeyword,
        status: "review",
        markdown: written.markdown,
        metaTitle: brief.metaTitle,
        metaDescription: brief.metaDescription,
        wordCount: written.wordCount,
        gates: written.gates,
        unverified: written.unverified,
        generatedBy: written.generatedBy,
        model: written.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedUrl: null,
        reviewerNote: null,
      };
      mutate((w) => {
        w.content.unshift(record);
        logActivity(w, {
          siteId: site.id,
          actor: written.generatedBy === "model" ? "writer" : "content-strategist",
          action: written.generatedBy === "model" ? "Draft written" : "Brief expanded",
          detail: brief.title,
        });
      });
      setView("drafts");
      setOpen(record.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draft could not be written.");
    } finally {
      setBusy(null);
    }
  }

  function decide(record: ContentRecord, status: ContentRecord["status"], reviewerNote?: string) {
    mutate((w) => {
      const item = w.content.find((c) => c.id === record.id);
      if (!item) return;
      item.status = status;
      item.updatedAt = new Date().toISOString();
      if (reviewerNote !== undefined) item.reviewerNote = reviewerNote;
      logActivity(w, {
        siteId: record.siteId,
        actor: "you",
        action: status === "approved" ? "Draft approved" : status === "rejected" ? "Draft rejected" : "Changes requested",
        detail: record.title,
      });
    });
  }

  return (
    <>
      <PageHeader
        title="Content"
        description="Gaps found from your own pages, your competitors and the terms you named, turned into briefs and then into drafts that have to pass the gates before you read them."
        action={<Link href="/app/settings" className="button small">{hasKey ? "Model connected" : "Add a model key"}</Link>}
      />

      {!hasKey && (
        <Notice kind="warn">
          No model key is set, so drafting produces the full structure rather than the prose: the outline, the
          answer block, the FAQ shell, the meta and the schema. Add your own provider key in{" "}
          <Link href="/app/settings">Settings</Link> and the same briefs are written out in full. The key stays in
          this browser and the bill is yours, not ours.
        </Notice>
      )}

      {error && <Notice kind="bad">{error}</Notice>}

      <Tabs
        tabs={[
          { key: "plan" as View, label: "The plan", count: result.gaps.length },
          { key: "drafts" as View, label: "Drafts", count: items.length },
        ]}
        active={view}
        onChange={setView}
      />

      {view === "plan" && (
        <div className="stack-sm">
          {result.gaps.map((gap) => {
            const brief =
              result.briefs.find((b) => b.title === gap.topic)
              ?? briefFor(gap, result.crawl, site.name, optionsFor(site));
            const existing = items.find((c) => c.title === gap.topic);
            return (
              <details className="reveal" key={gap.topic}>
                <summary>
                  <span className="row" style={{ gap: "0.5rem", display: "inline-flex" }}>
                    <Badge kind="neutral">{gap.format}</Badge>
                    <strong>{gap.topic}</strong>
                    {existing && <Badge kind="ok">drafted</Badge>}
                  </span>
                  <div className="tiny faint" style={{ marginTop: "0.2rem" }}>
                    {gap.targetKeyword} · {gap.intent} intent · priority {gap.priority}
                  </div>
                </summary>

                <div className="stack-sm">
                  <p className="small muted" style={{ margin: 0 }}>{gap.why}</p>

                  <dl className="kv small">
                    <dt>Audience</dt><dd>{brief.audience}</dd>
                    <dt>Target length</dt><dd>{formatNumber(brief.wordTarget)} words</dd>
                    <dt>Meta title</dt><dd className="mono">{brief.metaTitle}</dd>
                    <dt>Meta description</dt><dd className="mono">{brief.metaDescription}</dd>
                    <dt>Supporting terms</dt><dd>{brief.supportingKeywords.join(", ") || "none"}</dd>
                    <dt>Internal links</dt>
                    <dd>{brief.internalLinks.length ? brief.internalLinks.map((l) => l.url).join(", ") : "none identified"}</dd>
                  </dl>

                  <details className="reveal card-flat">
                    <summary className="small">The outline</summary>
                    <ul className="small" style={{ paddingLeft: "1.1rem" }}>
                      {brief.outline.map((section, i) => (
                        <li key={i} style={{ marginLeft: `${(section.level - 1) * 0.8}rem` }}>
                          <strong>{section.heading}</strong>
                          <div className="tiny muted">{section.guidance}</div>
                        </li>
                      ))}
                    </ul>
                  </details>

                  <details className="reveal card-flat">
                    <summary className="small">Schema for this page</summary>
                    <pre className="codeblock">{JSON.stringify(brief.schema, null, 2)}</pre>
                  </details>

                  <div className="notice small">
                    <strong>Answer block.</strong> {brief.answerBlock}
                  </div>

                  <div className="button-row">
                    <button className="primary small" disabled={busy === brief.id} onClick={() => draft(brief)}>
                      {busy === brief.id ? "Writing" : hasKey ? "Write the draft" : "Expand the brief"}
                    </button>
                    <CopyButton text={briefAsMarkdown(brief)} label="Copy the brief" />
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {view === "drafts" && (
        items.length === 0 ? (
          <Empty title="Nothing drafted yet">
            <p className="small">Pick something from the plan and it gets written.</p>
          </Empty>
        ) : (
          <div className="stack-sm">
            {items.map((record) => {
              const failing = record.gates.filter((g) => !g.passed);
              const isOpen = open === record.id;
              return (
                <Card key={record.id}>
                  <div className="between" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: "0.5rem" }}>
                        <Badge kind={record.status === "approved" ? "ok" : record.status === "rejected" ? "high" : "neutral"}>
                          {record.status}
                        </Badge>
                        <strong>{record.title}</strong>
                      </div>
                      <div className="tiny faint" style={{ marginTop: "0.25rem" }}>
                        {formatNumber(record.wordCount)} words · {record.generatedBy === "model" ? record.model : "structure only, no model used"} · {timeAgo(record.createdAt)}
                      </div>
                    </div>
                    <button className="small" onClick={() => setOpen(isOpen ? null : record.id)}>
                      {isOpen ? "Close" : "Read it"}
                    </button>
                  </div>

                  <div className="row" style={{ marginTop: "0.7rem", gap: "0.4rem" }}>
                    {record.gates.map((gate) => (
                      <span key={gate.gate} className={`badge badge-${gate.passed ? "ok" : "high"}`} title={gate.detail}>
                        {gate.gate}
                      </span>
                    ))}
                  </div>

                  {failing.length > 0 && (
                    <Notice kind="warn">
                      <strong>{failing.length} gate{failing.length === 1 ? "" : "s"} failed.</strong>
                      <ul className="small" style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
                        {failing.map((gate) => <li key={gate.gate}>{gate.gate}: {gate.detail}</li>)}
                      </ul>
                    </Notice>
                  )}

                  {record.unverified.length > 0 && (
                    <Notice kind="bad">
                      <strong>{record.unverified.length} claims need checking before this goes anywhere.</strong>
                      <ul className="small" style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
                        {record.unverified.slice(0, 6).map((claim, i) => <li key={i}>{claim}</li>)}
                      </ul>
                    </Notice>
                  )}

                  {isOpen && record.markdown && (
                    <>
                      <hr />
                      <dl className="kv small">
                        <dt>Slug</dt><dd className="mono">/{record.slug}</dd>
                        <dt>Meta title</dt><dd className="mono">{record.metaTitle}</dd>
                        <dt>Meta description</dt><dd className="mono">{record.metaDescription}</dd>
                        <dt>Target keyword</dt><dd>{record.targetKeyword}</dd>
                      </dl>
                      <hr />
                      <Markdown source={record.markdown} />
                    </>
                  )}

                  <div className="button-row" style={{ marginTop: "0.9rem" }}>
                    {record.status === "review" && (
                      <>
                        <button className="primary small" onClick={() => decide(record, "approved")}>Approve for publishing</button>
                        <button className="small" onClick={() => decide(record, "brief", "Sent back for another pass")}>Send back</button>
                        <button className="small danger" onClick={() => decide(record, "rejected")}>Reject</button>
                      </>
                    )}
                    {record.markdown && <CopyButton text={record.markdown} label="Copy the markdown" />}
                  </div>

                  {record.status === "approved" && (
                    <Notice kind="ok">
                      Approved. With a CMS connected this publishes on the next pass. Without one, copy the
                      markdown above: the platform will not pretend it published something it could not reach.
                    </Notice>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}
    </>
  );
}

function briefAsMarkdown(brief: ContentBrief): string {
  return [
    `# Brief: ${brief.title}`,
    ``,
    `- Primary keyword: ${brief.targetKeyword}`,
    `- Supporting: ${brief.supportingKeywords.join(", ") || "none"}`,
    `- Intent: ${brief.intent}`,
    `- Audience: ${brief.audience}`,
    `- Length: about ${brief.wordTarget} words`,
    `- Meta title: ${brief.metaTitle}`,
    `- Meta description: ${brief.metaDescription}`,
    ``,
    `## Answer block`,
    brief.answerBlock,
    ``,
    `## Outline`,
    ...brief.outline.map((s) => `${"  ".repeat(s.level - 1)}- ${s.heading}: ${s.guidance}`),
    ``,
    `## FAQ`,
    ...brief.faq.map((f) => `- ${f.q}`),
    ``,
    `## Citations needed`,
    ...brief.citationsNeeded.map((c) => `- ${c}`),
    ``,
    `## Notes`,
    ...brief.notes.map((n) => `- ${n}`),
  ].join("\n");
}
