"use client";

import Link from "next/link";

import { useSite } from "@/lib/site-hooks";
import { AnswerVisibilityPanel } from "@/components/answer-visibility";
import { buildLlmsTxt } from "@/engine/answers";
import { Badge, Card, CopyButton, Empty, Notice, PageHeader, Score, shortUrl } from "@/components/ui";

export default function AeoPage() {
  const { site, result } = useSite();

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="AI answers" />
        <Empty title="No run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Run the audit</Link> to check answer engine access.</p>
        </Empty>
      </>
    );
  }

  const aeo = result.aeo;
  const blocked = aeo.crawlerAccess.filter((a) => !a.allowed);
  const llmsFix = result.findings.find((f) => f.code === "missing_llms_txt")?.fix;
  const llmsTxt = buildLlmsTxt(result.crawl, { brand: site.name || site.domain, summary: site.industry || undefined });
  const robotsFix = result.findings.find((f) => f.code === "ai_crawler_blocked")?.fix;
  const notExtractable = result.findings.filter((f) => f.code === "content_not_extractable");

  return (
    <>
      <PageHeader
        title="AI answers"
        description="Two questions, in order. Can the engines reach and read you, and do they actually name you when someone asks."
      />

      {/* The measurement comes first. Readiness is the explanation for it. */}
      <AnswerVisibilityPanel site={site} result={result} />

      <div className="grid grid-3">
        <Score label="AI answer readiness" value={result.scores.aeo.score} hint="Weighted across access, structure and citability" />
        <div className="card score">
          <div className="label">Crawlers blocked</div>
          <div className={`value ${blocked.length ? "score-bad" : "score-good"}`}>{blocked.length}</div>
          <div className="hint">of {aeo.crawlerAccess.length} checked individually</div>
        </div>
        <div className="card score">
          <div className="label">Citable pages</div>
          <div className={`value ${aeo.citableAssets ? "score-good" : "score-bad"}`}>{aeo.citableAssets}</div>
          <div className="hint">Long enough, with figures a model can quote</div>
        </div>
      </div>

      {blocked.length > 0 && (
        <Notice kind="bad">
          <strong>{blocked.length} answer engines cannot crawl this site.</strong> That removes it from their
          answers entirely. Blocking them can be a deliberate choice. Doing it by accident, through a robots.txt
          somebody copied from a template, is the common case.
        </Notice>
      )}

      <Card title="Crawler access, agent by agent">
        <div className="table-scroll">
          <table>
            <thead><tr><th>User agent</th><th>Access</th><th>What it feeds</th></tr></thead>
            <tbody>
              {aeo.crawlerAccess.map((agent) => (
                <tr key={agent.agent}>
                  <td className="mono">{agent.agent}</td>
                  <td><Badge kind={agent.allowed ? "ok" : "high"}>{agent.allowed ? "allowed" : "blocked"}</Badge></td>
                  <td className="small muted">{agent.matters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {robotsFix && (
          <details className="reveal" style={{ marginTop: "0.9rem" }}>
            <summary className="small">The robots.txt that opens this up</summary>
            <pre className="codeblock after">{robotsFix.after}</pre>
            <div className="button-row" style={{ marginTop: "0.6rem" }}>
              <CopyButton text={robotsFix.after} label="Copy robots.txt" />
              <Link href={`/app/sites/${site.id}/approvals`} className="button small">Review it in the queue</Link>
            </div>
            <p className="tiny muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>{robotsFix.instructions}</p>
          </details>
        )}
      </Card>

      <Card title="Entity signals">
        <p className="small muted">
          An answer engine has to decide which company you are before it can cite you. These are the signals it
          uses, in the order it finds them.
        </p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Signal</th><th>Present</th><th>Why it matters</th></tr></thead>
            <tbody>
              {aeo.entitySignals.map((signal) => (
                <tr key={signal.signal}>
                  <td>{signal.signal}</td>
                  <td><Badge kind={signal.present ? "ok" : "medium"}>{signal.present ? "yes" : "missing"}</Badge></td>
                  <td className="small muted">{signal.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {notExtractable.length > 0 && (
        <Card title="Pages an engine cannot read">
          <Notice kind="bad">
            {notExtractable.length} page{notExtractable.length === 1 ? "" : "s"} arrive almost empty and fill in
            with JavaScript. Any engine that does not execute scripts, which is most of them when they are
            grounding an answer, sees nothing on these pages at all.
          </Notice>
          <div className="stack-sm" style={{ marginTop: "0.7rem" }}>
            {notExtractable.map((finding) => (
              <div key={finding.id} className="small">
                <a href={finding.url ?? "#"} target="_blank" rel="noopener noreferrer">{shortUrl(finding.url, 70)}</a>
                <div className="tiny faint">{finding.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Questions this site already answers">
        <p className="small muted">
          Pulled from the headings on the crawled pages. A question heading with a short direct answer under it is
          the shape an engine lifts most readily.
        </p>
        {aeo.answerable.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            No question headings were found. That is the single cheapest thing to change: turn the things customers
            actually ask into H2s, and answer each one in under 60 words.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Question</th><th>Direct answer</th><th>Page</th></tr></thead>
              <tbody>
                {aeo.answerable.map((item, i) => (
                  <tr key={i}>
                    <td>{item.question}</td>
                    <td>
                      <Badge kind={item.hasDirectAnswer ? "ok" : "medium"}>
                        {item.hasDirectAnswer ? "yes" : "not in the opening"}
                      </Badge>
                      {item.passage && <div className="tiny faint" style={{ marginTop: "0.25rem" }}>{item.passage}</div>}
                    </td>
                    <td style={{ maxWidth: "220px" }}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="truncate small" style={{ display: "block" }}>
                        {shortUrl(item.url, 38)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/*
        * Shown whether or not the site already has one. A file that exists and
        * lists the wrong forty pages is worse than none, and the only way to
        * know is to see what this crawl would have written.
        */}
      <Card title="llms.txt, generated from this crawl">
        <p className="small muted">
          A curated map for answer engines: the pages worth quoting, ranked by how much each one reads like an
          answer rather than a stub, with what each covers. Not a sitemap, which lists everything and ranks
          nothing. Trim anything you would not want quoted, then publish it at the site root.
          {llmsFix ? "" : " The site already has one; this is what the crawl would write today."}
        </p>
        <pre className="codeblock after" style={{ maxHeight: "360px", overflowY: "auto" }}>{llmsTxt}</pre>
        <div className="button-row" style={{ marginTop: "0.6rem" }}>
          <CopyButton text={llmsTxt} label="Copy llms.txt" />
        </div>
      </Card>

      <Card title="Questions worth owning next">
        <p className="small muted">
          Derived from what the site is about. Each one is a candidate for an answer block, an FAQ entry, or a page
          of its own.
        </p>
        <ul className="small" style={{ paddingLeft: "1.1rem", marginBottom: 0 }}>
          {aeo.questions.slice(0, 20).map((question, i) => <li key={i}>{question}</li>)}
        </ul>
      </Card>
    </>
  );
}
