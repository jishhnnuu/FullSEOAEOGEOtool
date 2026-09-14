"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Empty, PageHeader, formatNumber, severityKind, shortUrl } from "@/components/ui";

const ORDERS = [
  { key: "opportunity", label: "Opportunity" },
  { key: "issues", label: "Most issues" },
  { key: "aeo", label: "AI readiness" },
  { key: "words", label: "Word count" },
  { key: "inlinks", label: "Internal links in" },
  { key: "depth", label: "Shallowest first" },
] as const;

export default function PagesPage() {
  const { site, result } = useSite();
  const [order, setOrder] = useState<(typeof ORDERS)[number]["key"]>("opportunity");
  const [query, setQuery] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const rows = useMemo(() => {
    if (!result) return [];
    const filtered = result.inventory.filter((row) => {
      if (onlyProblems && row.issues === 0) return false;
      if (query && !`${row.url} ${row.title ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (order) {
        case "issues": return b.issues - a.issues;
        case "aeo": return b.aeoScore - a.aeoScore;
        case "words": return b.wordCount - a.wordCount;
        case "inlinks": return b.inlinks - a.inlinks;
        case "depth": return a.depth - b.depth;
        default: return b.opportunity - a.opportunity;
      }
    });
  }, [result, order, query, onlyProblems]);

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Pages" />
        <Empty title="No run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Run the audit</Link> to build the inventory.</p>
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Pages"
        description={`${result.crawl.fetched} pages fetched from ${result.crawl.discovered} URLs discovered. Opportunity weighs depth, internal links, length and the value of the issues found on the page.`}
      />

      <div className="row" style={{ marginBottom: "1rem" }}>
        <input
          placeholder="Filter by URL or title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: "320px" }}
        />
        <select value={order} onChange={(e) => setOrder(e.target.value as typeof order)} style={{ width: "auto" }}>
          {ORDERS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <label className="checkline" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Only pages with findings
        </label>
      </div>

      <Card>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Type</th>
                <th className="num">Status</th>
                <th className="num">Depth</th>
                <th className="num">Words</th>
                <th className="num">Links in</th>
                <th className="num">AI</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.url}>
                  <td style={{ maxWidth: "340px" }}>
                    <a href={row.url} target="_blank" rel="noopener noreferrer" className="truncate" style={{ display: "block" }}>
                      {shortUrl(row.url, 60)}
                    </a>
                    <div className="tiny faint truncate">{row.title ?? row.h1 ?? "no title"}</div>
                  </td>
                  <td className="small muted">{row.type}</td>
                  <td className="num">
                    <span style={{ color: row.status >= 400 || row.status === 0 ? "var(--bad)" : undefined }}>
                      {row.status || "-"}
                    </span>
                    {!row.indexable && <div className="tiny" style={{ color: "var(--warn)" }}>noindex</div>}
                  </td>
                  <td className="num">{row.depth}</td>
                  <td className="num">{formatNumber(row.wordCount)}</td>
                  <td className="num">{row.inlinks}</td>
                  <td className="num">{row.aeoScore}</td>
                  <td>
                    {row.issues === 0 ? (
                      <span className="faint small">none</span>
                    ) : (
                      <span className="row" style={{ gap: "0.3rem" }}>
                        <Badge kind={severityKind(row.worstSeverity ?? "low")}>{row.worstSeverity}</Badge>
                        <span className="small">{row.issues}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty title="Nothing matches that filter" />}
      </Card>
    </>
  );
}
