"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RunProgress } from "@/engine/run";
import { CATEGORY_LABEL } from "@/engine/catalog";
import { startRun } from "@/lib/runner";
import { overdueInBrowser, useSchedule } from "@/lib/schedule";
import { useConnections, useSession } from "@/lib/session";
import { useSite } from "@/lib/site-hooks";
import { DirectorBrief } from "@/components/director";
import { KeepThisRun } from "@/components/gate";
import { AuditScope } from "@/components/audit-scope";
import {
  Badge,
  Card,
  Empty,
  Notice,
  PageHeader,
  Score,
  formatNumber,
  scopeLabel,
  severityKind,
  timeAgo,
} from "@/components/ui";

export default function SiteDashboard() {
  const { site, result, runs, workspace } = useSite();
  const { session } = useSession();
  // The overview note stays until Search Console is connected for this site,
  // because until then the report is built from public pages alone.
  const { connections } = useConnections(Boolean(session.user));
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedBySchedule, setStartedBySchedule] = useState(false);
  const running = runs.some((r) => r.status === "running");
  const { data: schedule, markRan } = useSchedule(site?.id, Boolean(session.user));

  const run = useCallback(async () => {
    if (!site) return;
    setError(null);
    const handle = startRun(site, setProgress);
    try {
      await handle.promise;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run failed.");
    } finally {
      setProgress(null);
    }
  }, [site]);

  /*
   * The half of the schedule that needs a tab.
   *
   * The audit runs in this browser, so a scheduled crawl cannot start itself.
   * The schedule screen says exactly that, and this is the other half of the
   * promise: when a run is overdue, opening the app begins it. Once per visit,
   * never on top of a run already going, and the schedule is told so it stops
   * reading as overdue.
   */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !site || !schedule?.signedIn || running || progress) return;
    if (!overdueInBrowser(schedule.schedules).includes("audit")) return;
    autoStarted.current = true;
    setStartedBySchedule(true);
    void run().then(() => markRan("audit", "Crawled in the browser, on schedule."));
  }, [site, schedule, running, progress, run, markRan]);

  if (!site) return null;

  const pending = workspace.approvals.filter((a) => a.siteId === site.id && a.status === "pending");
  const diff = runs.find((r) => r.diff)?.diff ?? null;
  const connected = site.integrations.filter((i) => i.status === "connected");

  return (
    <>
      <PageHeader
        title={site.name}
        description={`${site.domain} · ${site.businessType}${site.industry ? ` · ${site.industry}` : ""}`}
        action={
          <button className="primary" onClick={() => void run()} disabled={running || !!progress}>
            {progress || running ? "Running" : runs.length ? "Run now" : "Start the first run"}
          </button>
        }
      />

      <DirectorBrief site={site} result={result ?? null} diff={diff} workspace={workspace} />

      {!connections.some((c) => c.provider === "gsc" && c.status === "connected" && (!c.siteId || c.siteId === site.id)) ? (
        <AuditScope compact />
      ) : null}

      {startedBySchedule ? (
        <Notice kind="ok" title="This run started on its own">
          The audit was due on your schedule. It runs in this browser rather than on a server, so it waits for you to
          open the app and then begins without being asked.{" "}
          <Link href={`/app/sites/${site.id}/schedule`}>Change the cadence</Link>.
        </Notice>
      ) : null}

      {/* Offered once the report exists, never before it. */}
      {runs.length > 0 && !progress ? <KeepThisRun siteId={site.id} /> : null}

      {progress && (
        <Card className="card-flat" title="Run in progress">
          <div className="progress" style={{ marginBottom: "0.9rem" }}>
            <span style={{ width: `${progress.target ? Math.min(100, (progress.fetched / progress.target) * 100) : 5}%` }} />
          </div>
          <div className="small muted">{progress.message}</div>
          <div className="steps" style={{ marginTop: "0.8rem" }}>
            {progress.steps.filter((s) => s.status !== "pending").map((step) => (
              <div className={`step step-${step.status}`} key={step.key}>
                <span className="step-dot" />
                <div>
                  <div className="small">{step.label}</div>
                  {step.detail && <div className="tiny muted">{step.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {error && <Notice kind="bad">{error}</Notice>}

      {!result && !progress && (
        <Empty title="No completed run yet">
          <p className="small">Start a run and the whole catalogue goes over the live site.</p>
        </Empty>
      )}

      {result && (
        <>
          {/*
            * Coverage sits above the scores, not under them. A score computed
            * over 40 of 55 pages is a score of those 40 pages, and the reader
            * has to know that before they read the number, not after.
            */}
          {result.coverage ? (
            <div className={`coverage${result.coverage.complete ? " complete" : ""}`}>
              <strong>{result.coverage.complete ? "Full coverage" : "Partial coverage"}</strong>
              <span className="muted">{result.coverage.headline}</span>
              {result.coverage.unseen.length > 0 ? (
                <details style={{ width: "100%" }}>
                  <summary className="tiny faint">Which pages were not read</summary>
                  <div className="mono tiny" style={{ maxHeight: "200px", overflowY: "auto", marginTop: "0.4rem" }}>
                    {result.coverage.gaps.map((gap) => (
                      <div key={gap.section}>
                        <strong>{gap.section}</strong>: {gap.count} unseen
                        {gap.examples.map((url) => (
                          <div key={url} className="truncate" style={{ paddingLeft: "1rem", opacity: 0.75 }}>{url}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-4">
            <Score
              label="Search health"
              value={result.scores.health.score}
              change={diff?.scores.find((s) => s.key === "health")?.change}
              hint="Crawlable, indexable, understood"
            />
            <Score
              label="AI answer readiness"
              value={result.scores.aeo.score}
              change={diff?.scores.find((s) => s.key === "aeo")?.change}
              hint="Reachable, parseable, citable"
            />
            <Score
              label="Authority"
              value={result.scores.authority.score}
              change={diff?.scores.find((s) => s.key === "authority")?.change}
              hint="Links, entity, local presence"
              measured={result.scores.authority.measured}
              unmeasuredReason={result.scores.authority.unmeasuredReason}
              unmeasuredFix={result.scores.authority.unmeasuredFix}
            />
            <Score
              label="Experience"
              value={result.scores.experience.score}
              change={diff?.scores.find((s) => s.key === "experience")?.change}
              hint="Speed, mobile, can they act"
              measured={result.scores.experience.measured}
              unmeasuredReason={result.scores.experience.unmeasuredReason}
              unmeasuredFix={result.scores.experience.unmeasuredFix}
            />
          </div>

          {diff && (
            <Card title="Since the last run" action={<Link href={`/app/sites/${site.id}/reports`} className="small">Full report</Link>}>
              <p style={{ marginBottom: "0.6rem" }}><strong>{diff.headline}</strong></p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {diff.narrative.slice(0, 4).map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </Card>
          )}

          <div className="grid grid-2">
            <Card
              title="Waiting on you"
              action={<Link href={`/app/sites/${site.id}/approvals`} className="small">Open the queue</Link>}
            >
              {pending.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>Nothing is queued. Run again to look for new work.</p>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: "0.7rem" }}>
                    <span className="score value" style={{ fontSize: "1.6rem" }}>{pending.length}</span>
                    <span className="small muted">changes drafted and ready</span>
                  </div>
                  <div className="stack-sm">
                    {pending.slice(0, 5).map((approval) => (
                      <div key={approval.id} className="row small between" style={{ gap: "0.5rem" }}>
                        <span className="truncate">{approval.title}</span>
                        <Badge kind={severityKind(approval.risk)}>{approval.risk}</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card
              title="Quick wins"
              action={<Link href={`/app/sites/${site.id}/findings`} className="small">All findings</Link>}
            >
              {result.quickWins.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>Nothing cheap left. What remains needs real work.</p>
              ) : (
                <div className="stack-sm">
                  {result.quickWins.slice(0, 6).map((finding) => (
                    <div key={finding.id} className="row small" style={{ gap: "0.5rem", alignItems: "flex-start" }}>
                      <Badge kind={severityKind(finding.severity)}>{finding.severity}</Badge>
                      <div style={{ minWidth: 0 }}>
                        <div className="truncate">{finding.title}</div>
                        <div className="tiny faint truncate">{scopeLabel(finding)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-2">
            <Card title="Findings by area">
              <div className="stack-sm">
                {Object.entries(
                  result.findings.reduce<Record<string, number>>((acc, f) => {
                    acc[f.category] = (acc[f.category] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, count]) => (
                    <div key={category} className="between small">
                      <Link href={`/app/sites/${site.id}/findings`}>
                        {CATEGORY_LABEL[category] ?? category}
                      </Link>
                      <span className="mono">{count}</span>
                    </div>
                  ))}
              </div>
            </Card>

            <Card title="The crawl">
              <dl className="kv">
                <dt>Pages fetched</dt><dd>{formatNumber(result.crawl.fetched)}{result.crawl.capped ? " (capped)" : ""}</dd>
                <dt>URLs discovered</dt><dd>{formatNumber(result.crawl.discovered)}</dd>
                <dt>robots.txt</dt><dd>{result.crawl.files.robotsStatus === 200 ? "Found" : "Missing"}</dd>
                <dt>Sitemaps</dt><dd>{result.crawl.files.sitemapUrls.length || "None found"}</dd>
                <dt>llms.txt</dt><dd>{result.crawl.files.llmsTxt ? "Present" : "Missing"}</dd>
                <dt>AI crawlers blocked</dt>
                <dd>
                  {result.crawl.files.blockedAiCrawlers.length === 0
                    ? "None"
                    : <span style={{ color: "var(--bad)" }}>{result.crawl.files.blockedAiCrawlers.join(", ")}</span>}
                </dd>
                <dt>Finished</dt><dd>{timeAgo(result.finishedAt)}</dd>
              </dl>
              {result.notes.map((note, i) => (
                <div className="notice notice-warn small" key={i} style={{ marginTop: "0.7rem" }}>{note}</div>
              ))}
            </Card>
          </div>

          <Card title="What this would have cost">
            <div className="row" style={{ gap: "2rem", alignItems: "baseline" }}>
              <div>
                <div className="score value" style={{ fontSize: "1.9rem" }}>{result.estimatedAgencyHours}</div>
                <div className="tiny faint">agency hours for the same output</div>
              </div>
              <div>
                <div className="score value" style={{ fontSize: "1.9rem" }}>{result.findings.filter((f) => f.fix).length}</div>
                <div className="tiny faint">fixes already written</div>
              </div>
              <div>
                <div className="score value" style={{ fontSize: "1.9rem" }}>{result.briefs.length}</div>
                <div className="tiny faint">content briefs</div>
              </div>
              <div>
                {/* Zero in every currency, so no symbol is needed and none is guessed. */}
                <div className="score value" style={{ fontSize: "1.9rem" }}>Nothing</div>
                <div className="tiny faint">marginal cost of this run</div>
              </div>
            </div>
            <p className="tiny faint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
              The hours estimate comes from the effort weighting on the findings this run actually produced, times
              the pages each one touches. It is an estimate, and it is derived rather than chosen.
            </p>
          </Card>

          {connected.length === 0 && (
            <Notice kind="warn">
              Nothing is connected yet, so the keyword model comes from your own copy rather than real queries, and
              results cannot be attributed.{" "}
              <Link href={`/app/sites/${site.id}/integrations`}>See what each connection unlocks</Link>.
            </Notice>
          )}
        </>
      )}
    </>
  );
}
