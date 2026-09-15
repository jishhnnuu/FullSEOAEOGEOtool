"use client";

import Link from "next/link";
import { useState } from "react";

import type { AnswerVisibility } from "@/engine/answers";
import type { AuditResult } from "@/engine/types";
import { measureVisibility, previewPrompts, NoModelKey, type Progress } from "@/lib/visibility";
import { update, type SiteRecord, type VisibilityHistory } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { Badge, Card, Notice, formatNumber } from "@/components/ui";

/**
 * Whether the answer engines actually name you.
 *
 * Every other check in this product asks whether an engine *could* use the
 * site. This asks whether it *does*, by putting the questions a buyer would
 * type to a model and reading what comes back.
 *
 * The number that matters is presence: how many of the prompts asked produced
 * an answer that named the site. It is reported as a fraction of what was
 * asked, never as a rank, because a model's answer is one sample of something
 * stochastic and a tool that dresses that up as a league position is lying
 * politely.
 */
export function AnswerVisibilityPanel({ site, result }: { site: SiteRecord; result: AuditResult }) {
  const [workspace] = useWorkspace();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);

  const history = workspace.visibility.find((v) => v.siteId === site.id) ?? null;
  const latest = (history?.latest ?? null) as AnswerVisibility | null;
  const prompts = previewPrompts(result, site);
  const hasKey = Boolean(workspace.model?.apiKey);

  async function ask() {
    setRunning(true);
    setError(null);
    try {
      const visibility = await measureVisibility(result, site, workspace.model, {
        onProgress: setProgress,
      });
      update((w) => {
        const point = {
          at: visibility.askedAt,
          presence: visibility.presence,
          citationRate: visibility.citationRate,
          asked: visibility.runs.length,
        };
        const existing = w.visibility.find((v) => v.siteId === site.id);
        if (existing) {
          existing.points = [...existing.points, point].slice(-40);
          existing.latest = visibility;
        } else {
          w.visibility.push({ siteId: site.id, points: [point], latest: visibility } satisfies VisibilityHistory);
        }
      });
    } catch (failure) {
      setError(failure instanceof NoModelKey ? failure.message : failure instanceof Error ? failure.message : "That did not run.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const previous = history && history.points.length > 1 ? history.points[history.points.length - 2] : null;
  const delta = latest && previous ? latest.presence - previous.presence : null;

  return (
    <Card
      title="Do the answer engines name you"
      action={
        hasKey ? (
          <button className="small primary" onClick={() => void ask()} disabled={running}>
            {running ? "Asking" : latest ? "Ask again" : "Ask the engines"}
          </button>
        ) : (
          <Link href="/app/settings" className="button small">Add a model key</Link>
        )
      }
    >
      <p className="small muted">
        Every other check on this screen asks whether an engine <em>could</em> use the site. This asks whether it
        does, by putting {prompts.length} questions a buyer would actually type to a model and reading the answers.
        It runs on your own provider key, so it costs you a few cents of your own tokens rather than a
        subscription.
      </p>

      {!hasKey ? (
        <Notice kind="warn" title="This one needs your model key">
          Somebody has to pay the provider for the questions, and it is not going to be a key of ours, because
          there isn&apos;t one. Add your own in <Link href="/app/settings">Settings</Link>. It is used for the
          call and never stored. Everything else in this product works without it.
        </Notice>
      ) : null}

      {error ? <Notice kind="error" title="That did not run">{error}</Notice> : null}

      {running && progress ? (
        <div style={{ marginTop: "0.9rem" }}>
          <div className="progress">
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
          </div>
          <p className="tiny muted" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
            {progress.done} of {progress.total}. Asking: {progress.asking}
          </p>
        </div>
      ) : null}

      {latest ? (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Named you</span>
              <span className="stat-value">
                {Math.round(latest.presence * 100)}%
                {delta !== null && Math.abs(delta) > 0.001 ? (
                  <span className={`tiny ${delta > 0 ? "score-good" : "score-bad"}`} style={{ marginLeft: "0.35rem" }}>
                    {delta > 0 ? "+" : ""}
                    {Math.round(delta * 100)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Linked you</span>
              <span className="stat-value">{Math.round(latest.citationRate * 100)}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Prompts asked</span>
              <span className="stat-value">{latest.runs.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Rivals named</span>
              <span className="stat-value">{latest.rivals.length}</span>
            </div>
          </div>

          <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
            Named means the answer mentioned you. Linked means it carried your domain, which is the only version
            that sends anyone. Asked {new Date(latest.askedAt).toLocaleString()}.
          </p>

          {latest.notes.map((note) => (
            <Notice key={note} kind="warn">{note}</Notice>
          ))}

          {latest.rivals.length > 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>WHO ELSE THE ANSWERS NAMED</div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Named</th><th className="num">Answers</th><th className="num">Share of prompts</th></tr>
                  </thead>
                  <tbody>
                    {latest.rivals.map((rival) => (
                      <tr key={rival.name}>
                        <td>{rival.name}</td>
                        <td className="num">{rival.appearances}</td>
                        <td className="num">{Math.round(rival.share * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {latest.losses.length > 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>
                QUESTIONS SOMEONE ELSE WON
              </div>
              {latest.losses.map((loss) => (
                <div key={loss.prompt} className="connection-row">
                  <div className="meta">
                    <strong className="small">{loss.prompt}</strong>
                    <span className="muted small">Answered with {loss.wonBy.join(", ")} and not you.</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <details className="reveal" style={{ marginTop: "1rem" }}>
            <summary className="small">Every answer, in full</summary>
            <div className="stack-sm">
              {latest.runs.map((run) => (
                <div key={run.promptId} className="card card-flat" style={{ background: "var(--bg-alt)" }}>
                  <div className="row" style={{ gap: "0.4rem", marginBottom: "0.4rem" }}>
                    <Badge kind={run.mention.cited ? "ok" : run.mention.named ? "warn" : "high"}>
                      {run.mention.cited ? "linked" : run.mention.named ? "named" : "absent"}
                    </Badge>
                    <strong className="small">{run.prompt}</strong>
                  </div>
                  {run.mention.passage ? (
                    <p className="small" style={{ margin: "0 0 0.4rem" }}>
                      <strong>Where you appear.</strong> {run.mention.passage}
                    </p>
                  ) : null}
                  <details>
                    <summary className="tiny faint">The whole answer</summary>
                    <p className="small" style={{ whiteSpace: "pre-wrap" }}>{run.answer}</p>
                  </details>
                </div>
              ))}
            </div>
          </details>

          {history && history.points.length > 1 ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>OVER TIME</div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Asked</th><th className="num">Named</th><th className="num">Linked</th><th className="num">Prompts</th></tr>
                  </thead>
                  <tbody>
                    {[...history.points].reverse().map((point) => (
                      <tr key={point.at}>
                        <td>{new Date(point.at).toLocaleDateString()}</td>
                        <td className="num">{Math.round(point.presence * 100)}%</td>
                        <td className="num">{Math.round(point.citationRate * 100)}%</td>
                        <td className="num">{formatNumber(point.asked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ marginTop: "0.9rem" }}>
          <button className="small" onClick={() => setShowPrompts(!showPrompts)}>
            {showPrompts ? "Hide" : "See"} the {prompts.length} questions first
          </button>
          {showPrompts ? (
            <div className="stack-sm" style={{ marginTop: "0.7rem" }}>
              {prompts.map((prompt) => (
                <div key={prompt.id} className="card card-flat" style={{ background: "var(--bg-alt)" }}>
                  <div className="row" style={{ gap: "0.4rem" }}>
                    <Badge kind="neutral">{prompt.kind}</Badge>
                    <strong className="small">{prompt.text}</strong>
                  </div>
                  <p className="tiny muted" style={{ margin: "0.3rem 0 0" }}>{prompt.why}</p>
                </div>
              ))}
              <p className="tiny faint" style={{ margin: 0 }}>
                Built from the crawl, not typed in. A visibility tool that makes you invent the questions measures
                the questions you thought of.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
