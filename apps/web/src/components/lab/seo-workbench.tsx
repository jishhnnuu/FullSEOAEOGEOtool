"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AuditScope } from "@/components/audit-scope";
import { LabBuddy } from "@/components/crew/scenes";
import type { RunProgress } from "@/engine/run";
import type { AuditResult, Finding, ScoreBreakdown, Severity } from "@/engine/types";
import { labPath } from "@/lib/brand";
import { startRun } from "@/lib/runner";
import { id, logActivity, update, type SiteRecord } from "@/lib/store";

/**
 * The SEO lab's workbench: the interface someone actually works in.
 *
 * Three states, one screen. Before a run it is a specimen slot: paste any
 * address. During a run it is an instrument panel: pages read, the step in
 * progress, and a live log. After it is a triage board: coverage first (the
 * rule is that a score is a score of what was read, and the reader is told
 * above the number), then the four scores, then every finding grouped by
 * problem with its fix written out and a copy button.
 *
 * It runs the same engine as the workspace and saves the run there, so
 * "open the full workspace" shows the same result with everything else the
 * workspace does (history, approvals, content plans).
 */

type Phase = "idle" | "running" | "done" | "error";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

const SCORE_LABELS: { key: keyof AuditResult["scores"]; label: string; hint: string }[] = [
  { key: "health", label: "Search health", hint: "Crawlable, indexable, understood" },
  { key: "aeo", label: "AI answer readiness", hint: "Reachable, parseable, citable" },
  { key: "authority", label: "Authority", hint: "Links, entity, local presence" },
  { key: "experience", label: "Experience", hint: "Speed, mobile, can they act" },
];

function normalise(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes(".") ? url.host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function newSite(domain: string): SiteRecord {
  return {
    id: id("site"),
    name: domain.split(".")[0].replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    domain,
    baseUrl: `https://${domain}`,
    businessType: "services",
    industry: "",
    cms: "Not sure",
    hosting: "Not sure",
    locations: [],
    competitors: [],
    targetKeywords: [],
    autonomy: "propose",
    goals: [],
    maxPages: 40,
    createdAt: new Date().toISOString(),
    integrations: [],
    schedule: [
      { mission: "weekly_growth_cycle", cadence: "weekly", enabled: true },
      { mission: "monthly_audit", cadence: "monthly", enabled: true },
    ],
    lastRunId: null,
  };
}

export function SeoWorkbench() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const started = useRef(false);

  function onProgress(next: RunProgress) {
    setProgress(next);
    if (next.message) {
      setLog((lines) => (lines[lines.length - 1] === next.message ? lines : [...lines.slice(-60), next.message]));
    }
  }

  async function run(raw: string) {
    const domain = normalise(raw);
    if (!domain) {
      setError("That doesn't look like a website address. Something like anywebsite.com.");
      return;
    }
    setError(null);
    setResult(null);
    setLog([`specimen: ${domain}`]);
    setPhase("running");
    const site = newSite(domain);
    setSiteId(site.id);
    update((w) => {
      if (!w.account) {
        w.account = { email: "", name: "", company: site.name, plan: "trial", createdAt: new Date().toISOString() };
      }
      w.sites.push(site);
      logActivity(w, { siteId: site.id, actor: "you", action: "Site added", detail: `${domain}, from the SEO lab` });
    });
    const handle = startRun(site, onProgress);
    stopRef.current = handle.stop;
    try {
      const done = await handle.promise;
      setResult(done);
      setPhase("done");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The run could not finish.");
      setPhase("error");
    }
  }

  // Arriving with ?url= starts straight away, like the agency's URL box.
  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (url) {
      started.current = true;
      setInput(url);
      if (params.get("go") === "1") void run(url);
    }
    // run is stable enough for a one-shot start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wb wb-seo tone-seo">
      <div className="wb-bar">
        <div>
          <div className="wb-crumbs lab-mono">
            <Link href={labPath()}>thymelab</Link> / <Link href={labPath("/seo")}>seo</Link> / <b>workbench</b>
          </div>
          <h1 className="wb-title">The SEO lab</h1>
        </div>
        <span className={`wb-state ${phase}`}>{phase === "idle" ? "Ready" : phase === "running" ? "Running" : phase === "done" ? "Complete" : "Stopped"}</span>
      </div>

      <form
        className="wb-specimen"
        onSubmit={(event) => {
          event.preventDefault();
          if (phase !== "running") void run(input);
        }}
      >
        <label htmlFor="wb-url" className="lab-mono">Specimen</label>
        <div className="wb-specimen-row">
          <span className="wb-proto lab-mono">https://</span>
          <input
            id="wb-url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="anywebsite.com"
            inputMode="url"
            autoComplete="url"
            disabled={phase === "running"}
          />
          {phase === "running" ? (
            <button type="button" className="lab-btn ghost" onClick={() => stopRef.current?.()}>Stop</button>
          ) : (
            <button type="submit" className="lab-btn">{result ? "Run again" : "Run experiment"} &rarr;</button>
          )}
        </div>
        <p className="wb-hint lab-mono">Any website: yours or a competitor&rsquo;s. Up to 40 pages on the free lab.</p>
        {error ? <p className="wb-error" role="alert">{error}</p> : null}
      </form>

      {phase === "idle" ? <IdleBench /> : null}
      {phase === "running" || (phase === "error" && !result) ? <RunningBench progress={progress} log={log} failed={phase === "error"} /> : null}
      {phase === "done" && result ? <Results result={result} siteId={siteId} /> : null}
    </div>
  );
}

function IdleBench() {
  return (
    <div className="wb-idle">
      <div className="wb-idle-grid">
        <div className="lab-card">
          <span className="lab-mono wb-k">01</span>
          <h3>Read</h3>
          <p className="lab-muted">Robots rules, sitemaps and the pages, the way a crawler sees them.</p>
        </div>
        <div className="lab-card">
          <span className="lab-mono wb-k">02</span>
          <h3>Check</h3>
          <p className="lab-muted">Technical SEO, content, structured data and AI search readiness.</p>
        </div>
        <div className="lab-card">
          <span className="lab-mono wb-k">03</span>
          <h3>Fix</h3>
          <p className="lab-muted">Every problem we can fix comes with the fix written out, ready to copy.</p>
        </div>
      </div>
      <AuditScope compact />
    </div>
  );
}

function RunningBench({ progress, log, failed }: { progress: RunProgress | null; log: string[]; failed: boolean }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);
  const percent = progress && progress.target > 0 ? Math.min(100, Math.round((progress.fetched / progress.target) * 100)) : 3;
  return (
    <div className="wb-running">
      <div className="wb-panel">
        <div className="wb-gauge">
          <span className="wb-gauge-n">{progress?.fetched ?? 0}</span>
          <span className="wb-gauge-of lab-mono">of {progress?.target || "?"} pages read</span>
        </div>
        <div className="wb-meter"><span style={{ width: `${percent}%` }} /></div>
        <ol className="wb-steps">
          {(progress?.steps ?? []).map((step) => (
            <li key={step.key} className={`wb-step ${step.status}`}>
              <span className="wb-dot" />
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="wb-side">
        <div className="lab-terminal wb-log" ref={logRef}>
          {log.map((line, i) => (
            <div key={i}><span className="dim">{String(i + 1).padStart(2, "0")}</span> {line}</div>
          ))}
          {failed ? <div className="hi">run stopped</div> : <div className="hi wb-cursor">_</div>}
        </div>
        <div className="wb-buddy"><LabBuddy tool="seo" /></div>
      </div>
    </div>
  );
}

type Group = { code: string; title: string; severity: Severity; count: number; why: string; recommendation: string; fix: Finding["fix"]; urls: string[]; priority: number };

function groupFindings(findings: Finding[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    if (f.severity === "info" || f.status === "fixed") continue;
    const existing = map.get(f.code);
    const urls = f.affectedUrls.length ? f.affectedUrls : f.url ? [f.url] : [];
    if (existing) {
      existing.count += Math.max(1, f.affectedCount || urls.length || 1);
      existing.urls.push(...urls);
      existing.priority = Math.max(existing.priority, f.priority);
      if (!existing.fix && f.fix) existing.fix = f.fix;
    } else {
      map.set(f.code, {
        code: f.code,
        title: f.title,
        severity: f.severity,
        count: Math.max(1, f.affectedCount || urls.length || 1),
        why: f.why,
        recommendation: f.recommendation,
        fix: f.fix,
        urls: [...urls],
        priority: f.priority,
      });
    }
  }
  const rank = (s: Severity) => SEVERITIES.indexOf(s);
  return [...map.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || b.priority - a.priority);
}

function Results({ result, siteId }: { result: AuditResult; siteId: string | null }) {
  const [tab, setTab] = useState<"findings" | "wins" | "pages">("findings");
  const [filter, setFilter] = useState<Severity | "all">("all");
  const groups = useMemo(() => groupFindings(result.findings), [result]);
  const counts = SEVERITIES.map((s) => ({ s, n: groups.filter((g) => g.severity === s).length }));
  const shown = filter === "all" ? groups : groups.filter((g) => g.severity === filter);
  const wins = useMemo(() => groupFindings(result.quickWins), [result]);

  return (
    <div className="wb-results">
      <div className="wb-coverage">
        <span className="lab-mono wb-k">Coverage</span>
        <p>{result.coverage.headline}</p>
      </div>

      <div className="wb-scores">
        {SCORE_LABELS.map(({ key, label, hint }) => (
          <Dial key={key} label={label} hint={hint} score={result.scores[key]} />
        ))}
      </div>

      <div className="wb-triage">
        <button type="button" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          <b>{groups.length}</b> problems
        </button>
        {counts.map(({ s, n }) => (
          <button type="button" key={s} className={`sev-${s}${filter === s ? " on" : ""}`} onClick={() => setFilter(s)} disabled={n === 0}>
            <b>{n}</b> {s}
          </button>
        ))}
      </div>

      <div className="wb-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "findings"} onClick={() => setTab("findings")}>Findings</button>
        <button role="tab" aria-selected={tab === "wins"} onClick={() => setTab("wins")}>Quick wins <span className="lab-mono">{wins.length}</span></button>
        <button role="tab" aria-selected={tab === "pages"} onClick={() => setTab("pages")}>Pages <span className="lab-mono">{result.inventory.length}</span></button>
      </div>

      {tab === "findings" ? <FindingList groups={shown} /> : null}
      {tab === "wins" ? <FindingList groups={wins} empty="No quick wins on this run." /> : null}
      {tab === "pages" ? <Pages result={result} /> : null}

      <div className="wb-next">
        {siteId ? <Link href={`/app/sites/${siteId}`} className="lab-btn">Open the full workspace &rarr;</Link> : null}
        <Link href="/book?service=search" className="lab-btn ghost">Have a specialist fix these</Link>
      </div>
      <AuditScope compact />
    </div>
  );
}

function Dial({ label, hint, score }: { label: string; hint: string; score: ScoreBreakdown }) {
  if (!score.measured) {
    return (
      <div className="wb-dial unmeasured">
        <div className="wb-ring"><span className="lab-mono">not<br />measured</span></div>
        <strong>{label}</strong>
        <span className="lab-muted small">{score.unmeasuredReason ?? hint}</span>
      </div>
    );
  }
  const value = Math.round(score.score);
  const tone = value >= 85 ? "good" : value >= 65 ? "warn" : "bad";
  return (
    <div className={`wb-dial ${tone}`}>
      <div className="wb-ring" style={{ ["--p" as string]: `${value}` }}>
        <span>{value}</span>
      </div>
      <strong>{label}</strong>
      <span className="lab-muted small">{hint}</span>
    </div>
  );
}

function FindingList({ groups, empty = "Nothing at this level." }: { groups: Group[]; empty?: string }) {
  const [open, setOpen] = useState<string | null>(groups[0]?.code ?? null);
  if (!groups.length) return <p className="lab-muted">{empty}</p>;
  return (
    <div className="wb-findings">
      {groups.map((g) => {
        const isOpen = open === g.code;
        return (
          <div key={g.code} className={`wb-finding sev-${g.severity}${isOpen ? " open" : ""}`}>
            <button type="button" className="wb-finding-head" onClick={() => setOpen(isOpen ? null : g.code)} aria-expanded={isOpen}>
              <span className={`wb-sev sev-${g.severity}`}>{g.severity}</span>
              <span className="wb-finding-title">{g.title}</span>
              <span className="lab-mono lab-muted">{g.count} {g.count === 1 ? "place" : "places"}</span>
              {g.fix ? <span className="wb-hasfix lab-mono">fix written</span> : null}
            </button>
            {isOpen ? (
              <div className="wb-finding-body">
                <p><b>Why it matters.</b> {g.why}</p>
                <p><b>What to do.</b> {g.recommendation}</p>
                {g.fix ? <FixBox fix={g.fix} /> : null}
                {g.urls.length ? (
                  <details>
                    <summary className="lab-mono">Where ({g.urls.length})</summary>
                    <ul className="wb-urls">
                      {[...new Set(g.urls)].slice(0, 25).map((u) => <li key={u}>{u.replace(/^https?:\/\//, "")}</li>)}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FixBox({ fix }: { fix: NonNullable<Finding["fix"]> }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="wb-fix">
      <div className="wb-fix-head">
        <span className="lab-mono">The fix: {fix.label}</span>
        <button
          type="button"
          className="lab-btn small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(fix.after);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {fix.before ? (
        <>
          <span className="lab-mono wb-k">Now</span>
          <pre className="wb-code before">{fix.before}</pre>
        </>
      ) : null}
      <span className="lab-mono wb-k">Change to</span>
      <pre className="wb-code after">{fix.after}</pre>
      <p className="lab-muted small">{fix.instructions}</p>
    </div>
  );
}

function Pages({ result }: { result: AuditResult }) {
  const rows = [...result.inventory].sort((a, b) => b.issues - a.issues).slice(0, 200);
  return (
    <div className="wb-pages table-scroll">
      <table>
        <thead>
          <tr><th>Page</th><th className="num">Status</th><th className="num">Words</th><th className="num">Issues</th><th>Worst</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.url}>
              <td style={{ maxWidth: "40ch", overflowWrap: "anywhere" }}>
                <div>{r.title ?? <span className="lab-muted">No title</span>}</div>
                <div className="lab-mono lab-muted" style={{ fontSize: "0.72rem" }}>{r.url.replace(/^https?:\/\//, "")}</div>
              </td>
              <td className="num">{r.status}</td>
              <td className="num">{r.wordCount.toLocaleString()}</td>
              <td className="num">{r.issues}</td>
              <td>{r.worstSeverity ? <span className={`wb-sev sev-${r.worstSeverity}`}>{r.worstSeverity}</span> : <span className="lab-muted">none</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
