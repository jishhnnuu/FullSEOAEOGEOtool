"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, formatNumber } from "@/components/ui";

type PageRow = {
  url: string; title: string | null; status_code: number | null; depth: number | null;
  word_count: number | null; indexable: boolean; template: string | null;
  aeo_score: number | null; opportunity: number | null; schema_types: string[];
  clicks_28d: number | null; impressions_28d: number | null; avg_position: number | null;
};

export default function PagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [order, setOrder] = useState("opportunity");
  const { data, error, isLoading } = useSWR<{ pages: PageRow[] }>(
    `/sites/${siteId}/pages?limit=300&order=${order}`,
    fetcher,
  );

  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <PageHeader
        title="Pages"
        description="Every page we crawled, with how ready each one is to be cited and how much is available on it."
      />
      <Card
        action={
          <select value={order} onChange={(e) => setOrder(e.target.value)} style={{ width: "auto" }}>
            <option value="opportunity">Most opportunity</option>
            <option value="aeo">Most citable</option>
            <option value="words">Longest</option>
            <option value="depth">Deepest</option>
          </select>
        }
      >
        {isLoading ? <Loading /> : !data?.pages.length ? (
          <Empty title="No pages crawled yet">
            <span className="small">Run a cycle from the dashboard to populate this.</span>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Page</th><th>Type</th><th className="num">Depth</th>
                  <th className="num">Words</th><th className="num">Citable</th>
                  <th className="num">Clicks</th><th className="num">Position</th>
                  <th className="num">Opportunity</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map((p) => (
                  <tr key={p.url}>
                    <td style={{ maxWidth: 320 }}>
                      <div className="truncate">
                        <a href={p.url} target="_blank" rel="noopener noreferrer">
                          {p.title ?? (p.url.replace(/^https?:\/\/[^/]+/, "") || "/")}
                        </a>
                      </div>
                      <div className="faint small truncate">
                        {p.url.replace(/^https?:\/\//, "")}
                        {!p.indexable && <> · <span className="score-bad">not indexable</span></>}
                        {p.status_code && p.status_code >= 400 && (
                          <> · <span className="score-bad">HTTP {p.status_code}</span></>
                        )}
                      </div>
                    </td>
                    <td>{p.template && <Badge kind="neutral">{p.template}</Badge>}</td>
                    <td className="num">{p.depth ?? "–"}</td>
                    <td className="num">{formatNumber(p.word_count)}</td>
                    <td className="num">
                      {p.aeo_score == null ? "–" : (
                        <span className={p.aeo_score >= 65 ? "score-good" : p.aeo_score >= 45 ? "score-warn" : "score-bad"}>
                          {Math.round(p.aeo_score)}
                        </span>
                      )}
                    </td>
                    <td className="num">{formatNumber(p.clicks_28d)}</td>
                    <td className="num">{p.avg_position?.toFixed(1) ?? "–"}</td>
                    <td className="num">{p.opportunity ? p.opportunity.toFixed(0) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
