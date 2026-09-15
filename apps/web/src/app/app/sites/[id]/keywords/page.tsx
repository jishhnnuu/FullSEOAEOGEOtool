"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSite } from "@/lib/site-hooks";
import { useSearchQueries } from "@/lib/measured";
import { useSession } from "@/lib/session";
import { Badge, Card, Empty, Notice, PageHeader, Tabs, formatNumber, shortUrl } from "@/components/ui";

type View = "measured" | "terms" | "gaps" | "cannibal";

export default function KeywordsPage() {
  const { site, result } = useSite();
  const { session } = useSession();
  const [view, setView] = useState<View>("terms");
  const [kind, setKind] = useState("all");

  // Real queries when there is an account with Search Console on it. The hook
  // does nothing at all when there is not, so a signed-out visitor makes no
  // request and waits for nothing.
  const measured = useSearchQueries(Boolean(session.user), { siteId: site?.id, days: 28, limit: 250 });

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
  const hasGsc = measured.data !== null;

  return (
    <>
      <PageHeader
        title="Keywords and topics"
        description="Built with tf-idf over your own pages, weighted towards titles and headings. It says what the site is currently about, which is the thing most keyword tools never tell you."
      />

      {hasGsc ? (
        <Notice kind="ok" title="These are measured, not modelled">
          {formatNumber(measured.data!.totals.impressions)} impressions and{" "}
          {formatNumber(measured.data!.totals.clicks)} clicks over 28 days, from{" "}
          <span className="mono tiny">{measured.data!.property}</span>. Search Console data lags by about three
          days, so the window ends there rather than today.
        </Notice>
      ) : measured.loading ? (
        <Notice kind="info">Reading Search Console.</Notice>
      ) : (
        <Notice kind="warn" title="This is a model of your own content, not real search demand">
          {measured.reason ? (
            <>
              {measured.reason} {measured.fix ?? ""}{" "}
            </>
          ) : (
            <>
              Connect <Link href={`/app/sites/${site.id}/integrations`}>Search Console</Link> and the list below is
              replaced by the queries people actually typed before they reached you.{" "}
            </>
          )}
          It is free, and for any site that already ranks for something it beats most paid keyword data.
        </Notice>
      )}

      <Tabs
        tabs={[
          ...(hasGsc
            ? [{ key: "measured" as View, label: "What people searched", count: measured.data!.rows.length }]
            : []),
          { key: "terms" as View, label: "What the site is about", count: result.keywords.length },
          { key: "gaps" as View, label: "Named but missing", count: gaps.length },
          { key: "cannibal" as View, label: "Competing with itself", count: cannibal.length },
        ]}
        active={view}
        onChange={setView}
      />

      {view === "measured" && measured.data && (
        <Card>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Query</th>
                  <th className="num">Clicks</th>
                  <th className="num">Impressions</th>
                  <th className="num">CTR</th>
                  <th className="num">Position</th>
                </tr>
              </thead>
              <tbody>
                {measured.data.rows.slice(0, 200).map((row) => (
                  <tr key={row.keys.join("|")}>
                    <td>{row.keys[0]}</td>
                    <td className="num">{formatNumber(row.clicks)}</td>
                    <td className="num">{formatNumber(row.impressions)}</td>
                    <td className="num">{(row.ctr * 100).toFixed(1)}%</td>
                    <td className="num">
                      {row.position.toFixed(1)}
                      {/* Page two is where impressions exist and clicks do not.
                          It is the cheapest work on any established site. */}
                      {row.position > 10 && row.position <= 20 && row.impressions > 50 ? (
                        <Badge kind="warn">page 2</Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny faint" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
            Rows marked page 2 are ranking between 11 and 20 with real impressions behind them. Those are the
            ones worth a rewrite first: the page already qualifies, it just is not being clicked.
          </p>
        </Card>
      )}

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
