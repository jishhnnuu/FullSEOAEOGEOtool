"use client";

import { useState } from "react";

import type { LinkVerdict } from "@/engine/backlinks";
import { LIMITS, TACTICS } from "@/engine/backlinks";
import { Badge, Card, Notice } from "@/components/ui";

/**
 * Verify claimed links, one paste at a time.
 *
 * The input is deliberately a textarea rather than an integration, because
 * every source of a link list is different: a Search Console export, an
 * agency's spreadsheet, a note from whoever did outreach last quarter. What
 * matters is that whatever is claimed gets checked against the live page
 * rather than believed.
 */
export function LinkVerifier({ targetDomain }: { targetDomain: string }) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [verdicts, setVerdicts] = useState<LinkVerdict[]>([]);
  const [error, setError] = useState<string | null>(null);

  const urls = input
    .split(/[\s,]+/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));

  async function verify() {
    setRunning(true);
    setError(null);
    setVerdicts([]);
    try {
      const out: LinkVerdict[] = [];
      // Ten at a time, because each one is a request to somebody else's server.
      for (let i = 0; i < Math.min(urls.length, 60); i += 10) {
        const response = await fetch("/api/links/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claims: urls.slice(i, i + 10).map((sourceUrl) => ({ sourceUrl, targetDomain })),
          }),
        });
        const body = (await response.json()) as { verdicts?: LinkVerdict[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? "That check did not run.");
        out.push(...(body.verdicts ?? []));
        setVerdicts([...out]);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That check did not run.");
    } finally {
      setRunning(false);
    }
  }

  const confirmed = verdicts.filter((v) => v.status === "confirmed");
  const followed = confirmed.filter((v) => v.followed && v.sourceIndexable);

  return (
    <Card title="Verify links, properly">
      <p className="small muted">
        Paste the URLs that are supposed to link to you. Each one is fetched and its anchors read from the served
        HTML, so <code>rel</code> survives and &quot;followed&quot; is a fact rather than a guess. Anything that
        reads a page as text has already destroyed that attribute before it checks, which is why so many tools
        report no nofollow when what they mean is they could not have seen one.
      </p>

      <textarea
        rows={4}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={"https://example.com/their-article\nhttps://another.com/resources"}
        style={{ fontFamily: "var(--mono)", fontSize: "0.82rem" }}
      />
      <div className="button-row" style={{ marginTop: "0.6rem" }}>
        <button className="primary small" onClick={() => void verify()} disabled={running || urls.length === 0}>
          {running ? `Checking ${verdicts.length} of ${urls.length}` : `Check ${urls.length || ""} link${urls.length === 1 ? "" : "s"}`}
        </button>
        {urls.length > 60 ? <span className="tiny faint">Only the first 60 will run.</span> : null}
      </div>

      {error ? <Notice kind="error" title="That did not run">{error}</Notice> : null}

      {verdicts.length > 0 ? (
        <>
          <div className="stat-row" style={{ marginTop: "1rem" }}>
            <div className="stat">
              <span className="stat-label">Checked</span>
              <span className="stat-value">{verdicts.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Live</span>
              <span className="stat-value">{confirmed.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Passing authority</span>
              <span className="stat-value">{followed.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Referring domains</span>
              <span className="stat-value">
                {new Set(confirmed.map((v) => { try { return new URL(v.sourceUrl).hostname; } catch { return v.sourceUrl; } })).size}
              </span>
            </div>
          </div>
          <p className="tiny faint" style={{ marginTop: "0.5rem" }}>
            Referring domains, not links, is the number that moves anything. Ten links from one site is one
            referring domain.
          </p>

          <div className="stack-sm" style={{ marginTop: "1rem" }}>
            {verdicts.map((verdict) => (
              <div key={verdict.sourceUrl} className="card card-flat" style={{ background: "var(--bg-alt)" }}>
                <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
                  <Badge
                    kind={
                      verdict.status !== "confirmed" ? "high"
                        : !verdict.sourceIndexable ? "high"
                          : verdict.followed ? "ok" : "warn"
                    }
                  >
                    {verdict.status !== "confirmed"
                      ? verdict.status.replace("_", " ")
                      : !verdict.sourceIndexable ? "noindexed source"
                        : verdict.followed ? "followed" : "nofollow"}
                  </Badge>
                  {verdict.status === "confirmed" ? <Badge kind="neutral">{verdict.placement}</Badge> : null}
                  <a href={verdict.sourceUrl} target="_blank" rel="noopener noreferrer" className="small truncate">
                    {verdict.sourceUrl}
                  </a>
                </div>
                <p className="small muted" style={{ margin: 0 }}>{verdict.note}</p>
                {verdict.anchors.length > 0 ? (
                  <div className="mono tiny" style={{ marginTop: "0.4rem", opacity: 0.8 }}>
                    {verdict.anchors.slice(0, 3).map((anchor, i) => (
                      <div key={i} className="truncate">
                        rel=&quot;{anchor.rel || "(none)"}&quot; · {anchor.anchorText || "(no anchor text)"}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** What the link side can and cannot know, stated rather than implied. */
export function LinkLimits() {
  return (
    <Card title="What this can and cannot see">
      <p className="small muted">
        A link report that does not say where its numbers came from is a link report nobody should act on. Here
        is the whole boundary.
      </p>
      {Object.entries(LIMITS).map(([key, value]) => (
        <div key={key} className="connection-row">
          <div className="meta">
            <strong style={{ textTransform: "capitalize" }}>{key}</strong>
            {"free" in value ? <span className="small">{value.free}</span> : null}
            {"strength" in value ? <span className="small">{value.strength}</span> : null}
            <span className="small muted"><strong>The limit.</strong> {value.gap}</span>
            {"consequence" in value ? (
              <span className="small" style={{ color: "var(--warn)" }}>{value.consequence}</span>
            ) : null}
          </div>
        </div>
      ))}
    </Card>
  );
}

/** The tactics, ordered by cost per link rather than by how impressive they sound. */
export function TacticPlan() {
  return (
    <Card title="How links actually get earned">
      <p className="small muted">
        Ordered by cost per link. Most programmes start at the bottom of this list, with guest posts, which is
        doing the hardest thing first. The top three need no relationship and no pitch, because the work is
        already done or the mistake is already made.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Tactic</th><th>What it is</th><th>Effort</th><th>Yield</th><th>Found for you</th></tr>
          </thead>
          <tbody>
            {TACTICS.map((tactic) => (
              <tr key={tactic.key}>
                <td><strong className="small">{tactic.name}</strong></td>
                <td className="small">{tactic.what}</td>
                <td><Badge kind={tactic.effort === "low" ? "ok" : tactic.effort === "medium" ? "warn" : "neutral"}>{tactic.effort}</Badge></td>
                <td className="small">{tactic.yield}</td>
                <td className="small">{tactic.automatable ? "yes" : "needs a person"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
