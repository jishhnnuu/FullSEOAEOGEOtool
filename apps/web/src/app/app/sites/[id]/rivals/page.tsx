"use client";

import Link from "next/link";
import { useState } from "react";

import { runAudit } from "@/engine/run";
import { benchmarkOptions, findGaps, sideFrom, type Benchmark, type BenchmarkSide } from "@/engine/benchmark";
import { optionsFor } from "@/lib/runner";
import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Empty, Notice, PageHeader, formatNumber } from "@/components/ui";
import { ContentGap } from "@/components/content-gap";
import { useSession } from "@/lib/session";

/**
 * The comparison, measured rather than estimated.
 *
 * Every tool in this category will sell you a competitor's traffic number. It
 * is a model of a model: a third party's guess at clickstream data, resold,
 * and it moves when the vendor changes their estimator. Nobody can audit it
 * and nobody can act on it.
 *
 * This crawls their public site with the same checks that ran against yours,
 * on the same day, and reports the differences that a person could close this
 * week. It cannot tell you their revenue. It can tell you they carry Product
 * schema and you do not.
 */
export default function RivalsPage() {
  const { site, result } = useSite();
  const { session } = useSession();
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState("");

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Rivals" />
        <Empty title="No run yet">
          <p className="small">
            <Link href={`/app/sites/${site.id}`}>Run your own audit</Link> first. There is nothing to compare
            against until there is a baseline.
          </p>
        </Empty>
      </>
    );
  }

  const rivals = [...new Set([...site.competitors, ...(added ? [added] : [])])].filter(Boolean);

  async function compare() {
    setError(null);
    const them: BenchmarkSide[] = [];
    try {
      for (const rival of rivals.slice(0, 4)) {
        let origin: string;
        try {
          origin = new URL(rival.startsWith("http") ? rival : `https://${rival}`).origin;
        } catch {
          continue;
        }
        setRunning(origin);
        const audit = await runAudit(
          benchmarkOptions(origin, optionsFor(site!)),
          { siteId: `bench-${origin}`, runId: `bench-${Date.now()}`, connected: [] },
          () => {},
        );
        them.push(sideFrom(audit, new URL(origin).hostname.replace(/^www\./, "")));
      }
      const you = sideFrom(result!, site!.domain);
      setBenchmark({ you, them, gaps: findGaps(you, them), ranAt: new Date().toISOString() });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That comparison did not finish.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Rivals"
        description="The same crawl and the same checks, run against their public site on the same day. No traffic estimates, because nobody can audit those."
      />

      <Card title="Who to compare against">
        <p className="small muted">
          Up to four, twelve pages each. Twelve is enough to see how a site is built and few enough to be polite
          about it. robots.txt is honoured on their site exactly as it is on yours.
        </p>
        {rivals.length > 0 ? (
          <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
            {rivals.map((rival) => <Badge key={rival} kind="neutral">{rival}</Badge>)}
          </div>
        ) : (
          <Notice kind="warn">
            No competitors are set for this site. Add them in{" "}
            <Link href={`/app/sites/${site.id}/settings`}>Settings</Link>, or type one below.
          </Notice>
        )}
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            value={added}
            onChange={(event) => setAdded(event.target.value)}
            placeholder="rival.com"
            style={{ maxWidth: "260px" }}
          />
          <button className="primary" onClick={() => void compare()} disabled={running !== null || rivals.length === 0}>
            {running ? `Crawling ${running}` : "Compare"}
          </button>
        </div>
        {error ? <Notice kind="error" title="That did not finish">{error}</Notice> : null}
      </Card>

      {benchmark ? (
        <>
          <Card title="Where you stand">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th className="num">Health</th>
                    <th className="num">AI answers</th>
                    <th className="num">Authority</th>
                    <th className="num">Experience</th>
                    <th className="num">Median words</th>
                    <th className="num">AI crawlers in</th>
                  </tr>
                </thead>
                <tbody>
                  {[benchmark.you, ...benchmark.them].map((side, index) => (
                    <tr key={side.origin} style={index === 0 ? { fontWeight: 600 } : undefined}>
                      <td>{index === 0 ? `${side.label} (you)` : side.label}</td>
                      <td className="num">{side.scores.health}</td>
                      <td className="num">{side.scores.aeo}</td>
                      <td className="num">{side.scores.authority}</td>
                      <td className="num">{side.scores.experience}</td>
                      <td className="num">{formatNumber(side.signals.medianWords)}</td>
                      <td className="num">
                        {side.signals.aiCrawlersAllowed}/{side.signals.aiCrawlersChecked}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny faint" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
              Their scores come from twelve pages and yours from {benchmark.you.pages}, so read the columns as a
              shape rather than a league table. The gaps below are the part that holds either way.
            </p>
          </Card>

          <Card title={`What they do that you do not (${benchmark.gaps.length})`}>
            {benchmark.gaps.length === 0 ? (
              <Notice kind="ok" title="Nothing material separates you on what a crawl can see">
                That is a real result. The remaining difference is off the page: links, brand, and how long each
                of you has been at it.
              </Notice>
            ) : (
              <div className="stack-sm">
                {benchmark.gaps.map((gap) => (
                  <div key={gap.title} className="card card-flat" style={{ background: "var(--bg-alt)" }}>
                    <div className="row" style={{ gap: "0.4rem", marginBottom: "0.3rem" }}>
                      <Badge kind={gap.weight > 0.85 ? "high" : gap.weight > 0.6 ? "warn" : "neutral"}>
                        {gap.weight > 0.85 ? "do this first" : gap.weight > 0.6 ? "worth doing" : "small edge"}
                      </Badge>
                      <strong className="small">{gap.title}</strong>
                    </div>
                    <p className="small muted" style={{ margin: 0 }}>{gap.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Schema, side by side">
            <div className="table-scroll">
              <table>
                <thead><tr><th>Site</th><th>Types carried</th></tr></thead>
                <tbody>
                  {[benchmark.you, ...benchmark.them].map((side, index) => (
                    <tr key={side.origin}>
                      <td>{index === 0 ? `${side.label} (you)` : side.label}</td>
                      <td className="small">
                        {side.signals.schemaTypes.length > 0 ? side.signals.schemaTypes.join(", ") : "none"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {/*
        * Site against site says how they are built. This says why one page of
        * yours is behind one page of theirs, which is the level a rewrite
        * actually happens at.
        */}
      <PageHeader
        title="Page against page"
        description="Site-level comparison tells you how they build. This tells you what to change on one page, and which page to change first."
      />
      <ContentGap result={result} signedIn={Boolean(session.user)} siteId={site.id} competitors={site.competitors} />
    </>
  );
}
