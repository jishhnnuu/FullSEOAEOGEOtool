"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { PointOfView } from "@/lib/store";
import { MANAGERS } from "@/lib/org";
import { useSite } from "@/lib/site-hooks";
import { Card, Empty, Notice, PageHeader, formatNumber, timeAgo } from "@/components/ui";

/*
 * The point of view.
 *
 * The content desk will not commission anything before this exists and has
 * been approved, because production quality applied to the wrong idea is the
 * most expensive failure in content marketing and the easiest one to make.
 *
 * What the browser can do here is assemble the evidence: what the site
 * already claims about itself, what it can prove, and what the field covers
 * that it does not. Writing the argument itself is a judgement call, so this
 * screen presents the inputs and takes the decision rather than generating a
 * thesis nobody agreed to and calling it strategy.
 */

const EXCLUDE = /\/(privacy|terms|cookie|legal|gdpr|accessibility|sitemap)/i;
const EMPTY: PointOfView = {
  consensus: "", flaw: "", argument: "", enemy: "", ladder: ["", "", ""],
  approvedAt: null, updatedAt: "",
};

export default function StrategyPage() {
  const { site, result, mutate } = useSite();
  const existing = site?.pointOfView ?? null;
  const [draft, setDraft] = useState<PointOfView>(existing ?? EMPTY);
  const [editing, setEditing] = useState(!existing);
  const manager = MANAGERS.find((m) => m.key === "content")!;

  /* The evidence the argument has to survive: what the site says, and what it proves. */
  const evidence = useMemo(() => {
    if (!result) return null;
    const pages = result.crawl.pages.filter((p) => p.signals && p.status === 200 && !EXCLUDE.test(p.url));
    const numbers = pages.reduce((n, p) => n + (p.signals?.numbers ?? 0), 0);
    const citations = pages.reduce((n, p) => n + (p.signals?.externalCitations ?? 0), 0);
    const withAuthor = pages.filter((p) => p.signals?.author).length;
    const claims = pages
      .map((p) => ({ url: p.url, title: p.signals?.title ?? "", lede: p.signals?.lede ?? "" }))
      .filter((p) => p.lede.length > 40)
      .slice(0, 5);
    return { pages: pages.length, numbers, citations, withAuthor, claims, gaps: result.briefs.length };
  }, [result]);

  if (!site) return null;

  function save(approved: boolean) {
    const now = new Date().toISOString();
    const value: PointOfView = {
      ...draft,
      ladder: draft.ladder.filter((l) => l.trim()),
      updatedAt: now,
      approvedAt: approved ? now : draft.approvedAt,
    };
    mutate((w) => {
      const target = w.sites.find((s) => s.id === site!.id);
      if (target) target.pointOfView = value;
    });
    setDraft(value);
    setEditing(false);
  }

  const ready = draft.consensus.trim() && draft.flaw.trim() && draft.argument.trim() && draft.enemy.trim();

  return (
    <>
      <PageHeader
        title="Point of view"
        description="One argument per client, written down, with everything laddering to it. The content desk will not commission a brief until this is approved."
        action={
          existing && !editing ? (
            <button className="small" onClick={() => setEditing(true)}>Edit</button>
          ) : null
        }
      />

      {existing?.approvedAt ? (
        <Notice kind="ok" title="Approved">
          Agreed {timeAgo(existing.approvedAt)}. Every brief the content desk writes has to ladder to one of the lines
          below, and the story editor rejects anything that does not.
        </Notice>
      ) : existing ? (
        <Notice kind="warn" title="Written, not approved">
          The content desk is holding. Nothing is commissioned against an argument nobody has agreed to.
        </Notice>
      ) : null}

      {editing ? (
        <Card title={existing ? "Edit the argument" : "Write the argument"}>
          <div className="stack">
            <label>
              <span className="small">What the field says, that you disagree with</span>
              <textarea
                id="pov-consensus"
                rows={2}
                value={draft.consensus}
                onChange={(e) => setDraft({ ...draft, consensus: e.target.value })}
                placeholder="The consensus position in your category, stated fairly enough that somebody holding it would recognise it."
              />
            </label>
            <label>
              <span className="small">Where that breaks</span>
              <textarea
                id="pov-flaw"
                rows={2}
                value={draft.flaw}
                onChange={(e) => setDraft({ ...draft, flaw: e.target.value })}
                placeholder="The specific case where the consensus fails. Specific beats clever."
              />
            </label>
            <label>
              <span className="small">What you say instead</span>
              <textarea
                id="pov-argument"
                rows={3}
                value={draft.argument}
                onChange={(e) => setDraft({ ...draft, argument: e.target.value })}
                placeholder="Your position. If nobody could argue with it, it is a description rather than an argument."
              />
            </label>
            <label>
              <span className="small">The enemy</span>
              <input
                id="pov-enemy"
                value={draft.enemy}
                onChange={(e) => setDraft({ ...draft, enemy: e.target.value })}
                placeholder="A practice, a habit or a category of tool. Naming one is what makes the rest land."
              />
            </label>
            <div>
              <span className="small">The ladder</span>
              <p className="tiny faint" style={{ margin: "0.2rem 0 0.5rem" }}>
                Three to five supports. Everything commissioned has to hang from one of them.
              </p>
              <div className="stack-sm">
                {draft.ladder.map((rung, i) => (
                  <input
                    key={i}
                    id={`pov-ladder-${i}`}
                    value={rung}
                    onChange={(e) => {
                      const next = [...draft.ladder];
                      next[i] = e.target.value;
                      setDraft({ ...draft, ladder: next });
                    }}
                    placeholder={`Support ${i + 1}`}
                  />
                ))}
              </div>
              <button
                className="small ghost"
                style={{ marginTop: "0.5rem" }}
                onClick={() => setDraft({ ...draft, ladder: [...draft.ladder, ""] })}
                disabled={draft.ladder.length >= 5}
              >
                Add a rung
              </button>
            </div>
            <div className="button-row">
              <button className="primary" onClick={() => save(true)} disabled={!ready}>
                Save and approve
              </button>
              <button className="small" onClick={() => save(false)} disabled={!ready}>Save without approving</button>
              {existing && <button className="small ghost" onClick={() => { setDraft(existing); setEditing(false); }}>Cancel</button>}
            </div>
            {!ready && (
              <p className="tiny faint" style={{ margin: 0 }}>
                The consensus, the flaw, the argument and the enemy are all required. An argument missing any one of
                them is a mission statement.
              </p>
            )}
          </div>
        </Card>
      ) : existing ? (
        <Card title="The argument">
          <dl className="kv">
            <dt>They say</dt><dd>{existing.consensus}</dd>
            <dt>It breaks because</dt><dd>{existing.flaw}</dd>
            <dt>You say</dt><dd><strong>{existing.argument}</strong></dd>
            <dt>Against</dt><dd>{existing.enemy}</dd>
          </dl>
          {existing.ladder.length > 0 && (
            <>
              <div className="tiny faint" style={{ margin: "0.9rem 0 0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                The ladder
              </div>
              <ol className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {existing.ladder.map((rung, i) => <li key={i} style={{ marginBottom: "0.25rem" }}>{rung}</li>)}
              </ol>
            </>
          )}
        </Card>
      ) : null}

      {evidence ? (
        <Card
          title="What the crawl can prove"
          action={<Link href={`/app/sites/${site.id}/content`} className="small">Briefs</Link>}
        >
          <p className="small muted" style={{ marginTop: 0 }}>
            An argument has to survive the site it sits on. These are the materials the content desk has to work with,
            counted from the pages already fetched.
          </p>
          <div className="grid grid-4">
            <div><div className="score value" style={{ fontSize: "1.5rem" }}>{formatNumber(evidence.pages)}</div><div className="tiny faint">pages of your own copy</div></div>
            <div><div className="score value" style={{ fontSize: "1.5rem" }}>{formatNumber(evidence.numbers)}</div><div className="tiny faint">figures you already publish</div></div>
            <div><div className="score value" style={{ fontSize: "1.5rem" }}>{formatNumber(evidence.citations)}</div><div className="tiny faint">outbound citations</div></div>
            <div><div className="score value" style={{ fontSize: "1.5rem" }}>{formatNumber(evidence.withAuthor)}</div><div className="tiny faint">pages that name an author</div></div>
          </div>
          {evidence.numbers < 10 && (
            <Notice kind="warn" title="Thin on proof">
              Ten figures across {evidence.pages} pages is not much for a writer to build on. The fact ledger will be
              thin, and thin drafts are the honest consequence rather than something to paper over.
            </Notice>
          )}
          {evidence.claims.length > 0 && (
            <>
              <div className="tiny faint" style={{ margin: "1rem 0 0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                What your pages currently claim
              </div>
              <div className="stack-sm">
                {evidence.claims.map((c) => (
                  <div key={c.url} className="small">
                    <div className="truncate"><strong>{c.title || c.url}</strong></div>
                    <div className="tiny muted">{c.lede.slice(0, 180)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      ) : (
        <Empty title="No run yet">
          <p className="small">
            <Link href={`/app/sites/${site.id}`}>Run the audit</Link> first. The argument is written against what the
            site already says, not in the abstract.
          </p>
        </Empty>
      )}

      <Card title={`What ${manager.name.toLowerCase()} refuses, whatever you ask`}>
        <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {manager.refusals.map((line, i) => <li key={i} style={{ marginBottom: "0.35rem" }}>{line}</li>)}
        </ul>
      </Card>
    </>
  );
}
