"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Empty, Notice, PageHeader, Tabs, shortUrl } from "@/components/ui";

type View = "terms" | "gaps" | "cannibal";

export default function KeywordsPage() {
  const { site, result } = useSite();
  const [view, setView] = useState<View>("terms");
  const [kind, setKind] = useState("all");

  const rows = useMemo(() => {
    if (!result) return [];
    return result.keywords.filter((row) => kind === "all" || row.kind === kind);
  }, [result, kind]);

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Keywords" />
        <Empty title="No run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Run the audit</Link> to build the topic model.</p>
        </Empty>
      </>
    );
  }

  const gaps = result.keywords.filter((k) => k.gap);
  const cannibal = result.keywords.filter((k) => k.cannibalised.length > 1);
  const hasGsc = site.integrations.some((i) => i.provider === "gsc" && i.status === "connected");

  return (
    <>
      <PageHeader
        title="Keywords and topics"
        description="Built with tf-idf over your own pages, weighted towards titles and headings. It says what the site is currently about, which is the thing most keyword tools never tell you."
      />

      {!hasGsc && (
        <Notice kind="warn">
          This is a model of your own content, not real search demand. Connect{" "}
          <Link href={`/app/sites/${site.id}/integrations`}>Search Console</Link> and it is replaced by the queries
          people actually typed before they reached you, which is free and better than most paid keyword data for
          any site that already ranks for something.
        </Notice>
      )}

      <Tabs
        tabs={[
          { key: "terms" as View, label: "What the site is about", count: result.keywords.length },
          { key: "gaps" as View, label: "Named but missing", count: gaps.length },
          { key: "cannibal" as View, label: "Competing with itself", count: cannibal.length },
        ]}
        active={view}
        onChange={setView}
      />

      {view === "terms" && (
        <>
          <div className="row" style={{ marginBottom: "1rem" }}>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: "auto" }}>
              <option value="all">Every kind</option>
              <option value="head">Head terms</option>
              <option value="body">Two word terms</option>
              <option value="long_tail">Long tail</option>
              <option value="local">Local</option>
              <option value="brand">Brand</option>
            </select>
          </div>
          <Card>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Kind</th>
                    <th>Intent</th>
                    <th className="num">Weight</th>
                    <th className="num">Pages</th>
                    <th>Strongest page</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 120).map((row) => (
                    <tr key={row.term}>
                      <td><strong>{row.term}</strong></td>
                      <td className="small muted">{row.kind.replace("_", " ")}</td>
                      <td className="small muted">{row.intent}</td>
                      <td className="num">{row.weight.toFixed(1)}</td>
                      <td className="num">{row.onPageCount}</td>
                      <td style={{ maxWidth: "280px" }}>
                        {row.bestUrl ? (
                          <a href={row.bestUrl} target="_blank" rel="noopener noreferrer" className="truncate small" style={{ display: "block" }}>
                            {shortUrl(row.bestUrl, 46)}
                          </a>
                        ) : <span className="faint small">none</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {view === "gaps" && (
        gaps.length === 0 ? (
          <Empty title="No named terms are missing">
            <p className="small">
              Add the terms you want to win in{" "}
              <Link href={`/app/sites/${site.id}/settings`}>settings</Link> and anything your site never mentions
              shows up here with a brief attached.
            </p>
          </Empty>
        ) : (
          <Card>
            <p className="small muted">
              You named these. The crawl found no page that mentions them, which means there is nothing for a
              search engine to rank and nothing for an answer engine to quote.
            </p>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Term</th><th>Intent</th><th>What to do</th></tr></thead>
                <tbody>
                  {gaps.map((row) => (
                    <tr key={row.term}>
                      <td><strong>{row.term}</strong></td>
                      <td><Badge kind="neutral">{row.intent}</Badge></td>
                      <td className="small muted">
                        {row.intent === "transactional"
                          ? "A landing page. Commercial intent with nowhere to land is the most expensive gap on this list."
                          : "A guide or an answer page. Check the content plan, a brief is already written for it."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
              <Link href={`/app/sites/${site.id}/content`}>Open the content plan</Link>
            </p>
          </Card>
        )
      )}

      {view === "cannibal" && (
        cannibal.length === 0 ? (
          <Empty title="No cannibalisation found">
            <p className="small">No term is being targeted by several pages hard enough to split its signals.</p>
          </Empty>
        ) : (
          <Card>
            <p className="small muted">
              Several pages are competing for the same term. Pick the one that should rank and point the others at
              it, with internal links or a redirect.
            </p>
            <div className="stack-sm">
              {cannibal.map((row) => (
                <details className="reveal" key={row.term}>
                  <summary>
                    <strong>{row.term}</strong>
                    <span className="faint small"> {row.cannibalised.length} pages</span>
                  </summary>
                  <div className="mono tiny">
                    {row.cannibalised.map((url) => (
                      <div key={url} className="truncate">
                        <a href={url} target="_blank" rel="noopener noreferrer">{shortUrl(url, 80)}</a>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Card>
        )
      )}
    </>
  );
}
