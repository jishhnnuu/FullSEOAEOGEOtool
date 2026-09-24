"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { reconcile, type PlatformResult } from "@/engine/ads";
import { AD_PLATFORMS } from "@/engine/ads.generated";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader, formatNumber } from "@/components/ui";

/*
 * The reconciliation, which is the one screen this desk exists to produce.
 *
 * Every dashboard in this category prints the sum of what the platforms
 * claim. Meta counts a sale it touched, Google counts the same sale, and the
 * total is more customers than the business had. This keeps them apart.
 *
 * Until an ad account is connected there is nothing to read, so the page
 * takes the figures by hand. That is not a placeholder: a founder with two
 * dashboards open and a shop admin in a third tab can settle the argument in
 * thirty seconds, which is the single most common question paid media
 * produces and one nobody currently answers for them.
 */

type Row = { platform: string; spend: string; claimed: string };

export default function PaidResults() {
  const { site } = useSite();
  const [rows, setRows] = useState<Row[]>([
    { platform: "google_ads", spend: "", claimed: "" },
    { platform: "meta_ads", spend: "", claimed: "" },
  ]);
  const [measured, setMeasured] = useState("");
  const [revenue, setRevenue] = useState("");

  const results: PlatformResult[] = useMemo(
    () =>
      rows
        .filter((r) => Number(r.spend) > 0)
        .map((r) => ({
          platform: AD_PLATFORMS.find((p) => p.key === r.platform)?.name ?? r.platform,
          spend: Number(r.spend) || 0,
          clicks: 0,
          impressions: 0,
          claimedConversions: Number(r.claimed) || 0,
        })),
    [rows],
  );

  const out = useMemo(
    () => reconcile(results, measured === "" ? null : Number(measured), revenue === "" ? null : Number(revenue)),
    [results, measured, revenue],
  );

  if (!site) return null;

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <>
      <PageHeader
        title="Results, reconciled"
        description="What each platform claims, what your business recorded, and why those two never match."
      />

      <Notice kind="warn" title="No ad account is connected, so the numbers are yours to enter">
        Once a platform is connected these fill themselves every morning. Until then, open your ad
        dashboards and your shop or CRM and put the figures in below. The arithmetic and the
        argument are identical either way.
      </Notice>

      <Card title="What each platform says it did">
        {rows.map((r, i) => (
          <div className="tool-form" key={i} style={{ alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 180px" }}>
              <span className="small">Platform</span>
              <select value={r.platform} onChange={(e) => update(i, { platform: e.target.value })}>
                {AD_PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
            </label>
            <label style={{ flex: "1 1 140px" }}>
              <span className="small">Spend</span>
              <input inputMode="decimal" value={r.spend} onChange={(e) => update(i, { spend: e.target.value })} placeholder="1000" />
            </label>
            <label style={{ flex: "1 1 200px" }}>
              <span className="small">Conversions it claims</span>
              <input inputMode="decimal" value={r.claimed} onChange={(e) => update(i, { claimed: e.target.value })} placeholder="30" />
            </label>
          </div>
        ))}
        <button
          type="button"
          className="button small"
          onClick={() => setRows((rs) => [...rs, { platform: "tiktok_ads", spend: "", claimed: "" }])}
        >
          Add a platform
        </button>
      </Card>

      <Card title="What your business actually recorded">
        <div className="tool-form" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 220px" }}>
            <span className="small">Conversions, from your own shop or CRM</span>
            <input inputMode="decimal" value={measured} onChange={(e) => setMeasured(e.target.value)} placeholder="41" />
          </label>
          <label style={{ flex: "1 1 200px" }}>
            <span className="small">Revenue, if you have it</span>
            <input inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="optional" />
          </label>
        </div>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          This is the only ground truth here. Everything above it is a platform marking its own homework.
        </p>
      </Card>

      {results.length > 0 && (
        <>
          <Card title="Kept apart, on purpose">
            <div className="check-list">
              {out.claimed.map((c) => (
                <div className="check-row" key={c.platform}>
                  <span className="badge badge-neutral">claimed</span>
                  <span className="check-title">
                    <strong>{c.platform}</strong>
                    <span className="tiny faint">{c.label}</span>
                  </span>
                  <span className="check-fix mono tiny">
                    {formatNumber(c.claimedConversions, 1)}
                    {c.claimedCpa !== null ? ` · ${formatNumber(c.claimedCpa, 2)} each` : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="tool-stats">
            <div className="tool-stat">
              <span className="tool-stat-value">{formatNumber(out.totalSpend, 0)}</span>
              <span className="tool-stat-label">total spend</span>
            </div>
            <div className="tool-stat">
              <span className="tool-stat-value">{formatNumber(out.claimedTotalIfSummed, 0)}</span>
              <span className="tool-stat-label">what the platforms claim between them</span>
            </div>
            <div className="tool-stat">
              <span className="tool-stat-value">
                {out.measuredConversions.measured ? formatNumber(out.measuredConversions.value, 0) : "—"}
              </span>
              <span className="tool-stat-label">what you actually recorded</span>
            </div>
            <div className="tool-stat">
              <span className="tool-stat-value">
                {out.blendedCac.measured ? formatNumber(out.blendedCac.value, 2) : "—"}
              </span>
              <span className="tool-stat-label">blended cost per customer</span>
            </div>
          </div>

          <Notice kind={out.measuredConversions.measured ? "ok" : "warn"} title="The gap">
            {out.gapNote}
          </Notice>

          <Card title="Why the sum is never the answer">
            <p className="small" style={{ marginTop: 0 }}>
              Each platform counts a conversion it touched, inside its own attribution window. A
              customer often touches two. Neither platform is lying and the total is still wrong,
              which is why this product never adds them up and why the figure above is carried only
              so the gap can be explained.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              Blended cost per customer is total spend over customers the business actually
              recorded. No attribution window can move it, which makes it the one number worth
              running a business on. The honest answer to whether the advertising caused those
              customers is a geographic holdout test, not an attribution model.{" "}
              <Link href="/paid">The desk page explains what it refuses.</Link>
            </p>
          </Card>
        </>
      )}
    </>
  );
}
