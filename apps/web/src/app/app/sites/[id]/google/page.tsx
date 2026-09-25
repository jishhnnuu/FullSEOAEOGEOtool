"use client";

/**
 * Your Google data, all of it, on one screen.
 *
 * The sync pulls every report in `engine/google-data.ts` into this browser,
 * and this screen reads only what was pulled: nothing is estimated, and each
 * report says what it covers and what Google leaves out of it. A report that
 * failed says so by name, above its table, with the date of the copy shown
 * instead.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, Chart, Notice, PageHeader, Tabs, formatNumber, timeAgo } from "@/components/ui";
import {
  GA4_REPORTS,
  GSC_REPORTS,
  ga4Totals,
  gscMatch,
  gscTotals,
  isoDay,
  periods,
  toCsv,
  weekly,
  type Cell,
  type StoredReport,
} from "@/engine/google-data";
import { forgetSite, loadMeta, loadReports, persistent, type SyncMeta } from "@/lib/google-store";
import { stale, syncGoogle, type SyncProgress } from "@/lib/google-sync";
import { needsProperty, useAutoMatch } from "@/lib/google-match";
import { useConnections, useSession, type Connection } from "@/lib/session";
import { useSite } from "@/lib/site-hooks";

type Tab = "gsc" | "ga4";

export default function GoogleDataPage() {
  const { site } = useSite();
  const { session, loading: sessionLoading } = useSession();
  const signedIn = Boolean(session.user);
  const { connections, loading: connectionsLoading, refresh } = useConnections(signedIn);
  const { matching, ambiguous } = useAutoMatch(site?.id, site?.baseUrl, connections, refresh);
  const [returned, setReturned] = useState<{ error: string | null; declined: string[]; connected: boolean }>({ error: null, declined: [], connected: false });

  // What Google's round trip wrote into the address, read once and cleared so
  // a reload does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("error") && !params.has("declined") && !params.has("connected")) return;
    setReturned({
      error: params.get("error"),
      declined: (params.get("declined") ?? "").split(",").filter(Boolean),
      connected: params.has("connected"),
    });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const [reports, setReports] = useState<StoredReport[]>([]);
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [keeps, setKeeps] = useState(true);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("gsc");
  const autoRan = useRef(false);

  const siteId = site?.id ?? "";
  const gsc = pick(connections, "gsc", siteId);
  const ga4 = pick(connections, "ga4", siteId);
  const gscProperty = gsc?.status === "connected" && typeof gsc.selection?.property === "string" ? gsc.selection.property : null;
  const ga4Property = ga4?.status === "connected" && typeof ga4.selection?.propertyId === "string" ? ga4.selection.propertyId : null;
  const ga4Name = typeof ga4?.selection?.name === "string" ? ga4.selection.name : null;

  const reload = useCallback(async () => {
    if (!siteId) return;
    const [r, m, p] = await Promise.all([loadReports(siteId), loadMeta(siteId), persistent()]);
    setReports(r);
    setMeta(m);
    setKeeps(p);
    setLoaded(true);
  }, [siteId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(async () => {
    if (!siteId || progress) return;
    setFailure(null);
    setProgress({ done: 0, total: 1, current: "Starting", rows: 0 });
    try {
      await syncGoogle({
        siteId,
        gsc: gscProperty ? { property: gscProperty } : null,
        ga4: ga4Property ? { propertyId: ga4Property, name: ga4Name } : null,
        onProgress: setProgress,
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
      await reload();
    }
  }, [siteId, progress, gscProperty, ga4Property, ga4Name, reload]);

  // Refresh on arrival when the copy is a day old, or when the property it
  // came from is no longer the one chosen.
  useEffect(() => {
    if (!loaded || autoRan.current || connectionsLoading) return;
    if (!gscProperty && !ga4Property) return;
    const moved = meta && ((gscProperty && meta.gscProperty !== gscProperty) || (ga4Property && meta.ga4Property !== ga4Property));
    if (stale(meta?.syncedAt) || moved) {
      autoRan.current = true;
      void run();
    }
  }, [loaded, connectionsLoading, gscProperty, ga4Property, meta, run]);

  if (!site) return null;

  const connectHref = `/api/connections/google/start?product=google&site=${site.id}&next=${encodeURIComponent(`/app/sites/${site.id}/google`)}`;
  const unchosen = [gsc, ga4].filter((c): c is Connection => Boolean(c && needsProperty(c)));
  const toChoose = unchosen.filter((c) => ambiguous.includes(c.id));
  const gscReports = ordered(reports.filter((r) => r.provider === "gsc"), [...GSC_REPORTS.map((r) => r.key), "inspection", "sitemaps"]);
  const ga4Reports = ordered(reports.filter((r) => r.provider === "ga4"), GA4_REPORTS.map((r) => r.key));
  const syncing = progress !== null;

  return (
    <div className="stack">
      <PageHeader
        title="Your Google data"
        description="Everything Search Console and Analytics hold for this site, pulled into this browser and read as Google reports it."
        action={
          gscProperty || ga4Property ? (
            <button className="primary" disabled={syncing} onClick={() => void run()}>
              {syncing ? "Syncing" : "Sync now"}
            </button>
          ) : null
        }
      />

      {returned.error ? <Notice kind="error" title="Google did not connect">{returned.error}</Notice> : null}
      {returned.declined.length ? (
        <Notice kind="warn" title={`${returned.declined.map((p) => (p === "gsc" ? "Search Console" : "Analytics")).join(" and ")} was left unticked`}>
          Google&apos;s screen has a box per product, and that one was not ticked, so it is not connected. Press Connect
          Google again and leave both boxes ticked.{" "}
          <a href={connectHref}>Connect Google again</a>
        </Notice>
      ) : null}
      {returned.connected && !returned.error ? (
        <Notice kind="ok" title="Google is connected">
          {matching ? "Finding the property that matches this site." : "The data syncs now, and again whenever it is a day old."}
        </Notice>
      ) : null}

      {!sessionLoading && !session.methods.google && !signedIn ? (
        <Notice kind="warn" title="Google sign-in is not switched on for this deployment yet">
          Connecting Google needs the owner to finish two short steps first.{" "}
          <Link href="/app/setup">See what is missing</Link>.
        </Notice>
      ) : null}

      {!sessionLoading && session.methods.google && !signedIn ? (
        <Card title="Connect Google">
          <p className="small">
            One button. Google asks which account to use, you tick Search Console and Analytics, and you land back
            here with the data syncing. No keys, no files to download.
          </p>
          <a className="button primary" href={connectHref}>Connect Google</a>
        </Card>
      ) : null}

      {signedIn && !connectionsLoading && !gsc && !ga4 ? (
        <Card title="Connect Google">
          <p className="small">Search Console and Analytics are not connected yet. It is one approval on Google&apos;s own screen.</p>
          <a className="button primary" href={connectHref}>Connect Google</a>
        </Card>
      ) : null}

      {toChoose.map((c) => (
        <Notice key={c.id} kind="warn" title={`Which ${c.provider === "gsc" ? "Search Console" : "Analytics"} property is ${site.domain}?`}>
          This Google account can see more than one, and none clearly matches this site, so nothing was guessed.{" "}
          <Link href={`/app/sites/${site.id}/integrations/choose?connection=${c.id}&next=google`}>Choose it</Link>
        </Notice>
      ))}
      {[gsc, ga4].filter((c): c is Connection => Boolean(c && c.status === "error")).map((c) => (
        <Notice key={c.id} kind="error" title={`${c.provider === "gsc" ? "Search Console" : "Analytics"} needs reconnecting`}>
          {c.lastError ?? "Google stopped accepting this connection."} <a href={connectHref}>Connect Google again</a>
        </Notice>
      ))}

      {(gscProperty || ga4Property || meta) && (
        <Card>
          <div className="stat-row" style={{ marginTop: 0 }}>
            <div className="stat">
              <span className="stat-label">Search Console</span>
              <span className="small">{gscProperty ?? (gsc ? "No property chosen" : "Not connected")}</span>
              {gscProperty && gscMatch(site.baseUrl, gscProperty) === 0 ? (
                <span className="small" style={{ color: "var(--bad)" }}>This property is not {site.domain}.</span>
              ) : null}
            </div>
            <div className="stat">
              <span className="stat-label">Analytics</span>
              <span className="small">{ga4Property ? `${ga4Name ?? "Property"} (${ga4Property})` : ga4 ? "No property chosen" : "Not connected"}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Last synced</span>
              <span className="small">
                {meta ? `${timeAgo(meta.syncedAt)}, took ${meta.seconds}s` : "Never"}
              </span>
              {meta?.gscNewest ? <span className="small muted">Search Console data runs to {meta.gscNewest}</span> : null}
            </div>
          </div>

          {progress ? (
            <div style={{ marginTop: "0.9rem" }}>
              <div className="between small">
                <span>{progress.current}</span>
                <span className="muted">
                  {progress.done} of {progress.total} reports · {formatNumber(progress.rows)} rows
                </span>
              </div>
              <div className="meter">
                <span style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, background: "var(--accent)" }} />
              </div>
            </div>
          ) : null}

          {failure ? <p className="small" style={{ color: "var(--bad)", marginTop: "0.7rem" }}>{failure}</p> : null}
          {meta && meta.errors.length > 0 && !syncing ? (
            <details className="acc" style={{ marginTop: "0.8rem" }}>
              <summary>
                {meta.errors.length} report{meta.errors.length === 1 ? "" : "s"} did not come back on the last sync
              </summary>
              <div className="acc-body">
                <ul className="small">{meta.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                <p className="small muted">Where an older copy exists it is still shown, labelled with its date.</p>
              </div>
            </details>
          ) : null}
          {!keeps ? (
            <p className="small muted" style={{ marginTop: "0.7rem" }}>
              This browser is refusing storage (a private window does this), so the data lasts until the tab closes.
            </p>
          ) : null}
        </Card>
      )}

      {reports.length > 0 ? (
        <>
          <Tabs
            tabs={[
              { key: "gsc" as Tab, label: "Search Console", count: gscReports.length },
              { key: "ga4" as Tab, label: "Analytics", count: ga4Reports.length },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === "gsc" ? <SearchConsole reports={gscReports} /> : <Analytics reports={ga4Reports} />}

          <details className="acc">
            <summary>What &ldquo;all the data&rdquo; means, exactly</summary>
            <div className="acc-body">
              <p className="small">
                <strong>Search Console</strong> keeps 16 months. Daily totals are complete. Tables by query or page
                are every row Google hands out, up to 100,000 per table, but Google itself leaves out queries it
                treats as rare or personal, so a query table always adds up to less than the daily totals. That gap
                is Google&apos;s, and no tool can close it.
              </p>
              <p className="small">
                <strong>Analytics</strong> answers from the property&apos;s own data. Where a report reaches its row
                limit, it says so above the table. Properties with Google signals switched on can have small rows
                withheld by Google&apos;s privacy thresholds.
              </p>
              <p className="small">
                <strong>Where it lives:</strong> in this browser only. The server holds the permission Google gave,
                sealed, and never a copy of the data.{" "}
                <button
                  className="small"
                  onClick={async () => {
                    await forgetSite(site.id);
                    await reload();
                  }}
                >
                  Delete the copy in this browser
                </button>
              </p>
            </div>
          </details>
        </>
      ) : loaded && (gscProperty || ga4Property) && !syncing ? (
        <Notice title="Nothing synced yet">Press Sync now. A first sync usually takes under a minute.</Notice>
      ) : null}
    </div>
  );
}

/** Reports in the order they are defined, which puts the headline ones first. */
function ordered(list: StoredReport[], keys: string[]): StoredReport[] {
  const at = (key: string) => (keys.indexOf(key) === -1 ? keys.length : keys.indexOf(key));
  return list.slice().sort((a, b) => at(a.key) - at(b.key));
}

/** The connection for this site, or the org-wide one when none is site-specific. */
function pick(connections: Connection[], provider: string, siteId: string): Connection | null {
  const mine = connections.filter((c) => c.provider === provider);
  return (
    mine.find((c) => c.siteId === siteId && c.status === "connected") ??
    mine.find((c) => c.siteId === siteId) ??
    mine.find((c) => !c.siteId && c.status === "connected") ??
    mine.find((c) => !c.siteId) ??
    null
  );
}

function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function Kpi({ label, value, previous, format, lowerIsBetter = false, places = false }: { label: string; value: number; previous: number; format: (n: number) => string; lowerIsBetter?: boolean; places?: boolean }) {
  const delta = change(value, previous);
  const good = delta == null || Math.abs(delta) < 0.5 ? "flat" : (delta > 0) !== lowerIsBetter ? "up" : "down";
  // Position moves in places, not percent: 10.0 to 9.5 is half a place up.
  const diff = value - previous;
  const text =
    delta == null
      ? "no earlier period"
      : places
        ? Math.abs(diff) < 0.05
          ? `unchanged from ${format(previous)}`
          : `${Math.abs(diff).toFixed(1)} ${diff < 0 ? "higher" : "lower"} than ${format(previous)}`
        : Math.abs(delta) < 0.05
          ? `unchanged from ${format(previous)}`
          : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}% vs ${format(previous)}`;
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{format(value)}</span>
      <span className={`delta delta-${good}`}>{text}</span>
    </div>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const whole = (n: number) => formatNumber(n);

function SearchConsole({ reports }: { reports: StoredReport[] }) {
  const daily = reports.find((r) => r.key === "daily");
  const newest = daily?.rows.length ? daily.rows.map((r) => String(r[0])).sort().at(-1)! : null;
  return (
    <div className="stack">
      {daily && newest ? (
        <Card title={`Last 28 days, to ${newest}`}>
          {(() => {
            const { current, previous } = periods(newest, 28);
            const now = gscTotals(daily, ...current);
            const before = gscTotals(daily, ...previous);
            return (
              <div className="stat-row" style={{ marginTop: 0 }}>
                <Kpi label="Clicks" value={now.clicks} previous={before.clicks} format={whole} />
                <Kpi label="Impressions" value={now.impressions} previous={before.impressions} format={whole} />
                <Kpi label="Click rate" value={now.ctr} previous={before.ctr} format={pct} />
                <Kpi label="Average position" value={now.position} previous={before.position} format={(n) => n.toFixed(1)} lowerIsBetter places />
              </div>
            );
          })()}
          <p className="small muted" style={{ marginTop: "0.7rem" }}>
            Compared with the 28 days before. Search Console&apos;s newest day is usually two or three days behind
            today; these periods end on the newest day it has.
          </p>
        </Card>
      ) : null}
      {daily ? (
        <Card title="16 months, week by week">
          <div className="grid grid-2">
            <Chart points={weekly(daily.rows, 1)} label="Clicks per week" format={(n) => formatNumber(n)} />
            <Chart points={weekly(daily.rows, 2)} label="Impressions per week" format={(n) => formatNumber(n)} />
          </div>
        </Card>
      ) : null}
      <Explorer reports={reports} />
    </div>
  );
}

function Analytics({ reports }: { reports: StoredReport[] }) {
  const daily = reports.find((r) => r.key === "daily");
  if (!reports.length) {
    return <Notice title="No Analytics data">Analytics is not connected, or no property is chosen.</Notice>;
  }
  // Analytics can take up to two days to finish a day, so the periods end the
  // day before yesterday rather than on a day still filling in.
  const end = isoDay(new Date(Date.now() - 2 * 86_400_000));
  const { current, previous } = periods(end, 28);
  const now = daily ? ga4Totals(daily, ...current) : null;
  const before = daily ? ga4Totals(daily, ...previous) : null;
  const sessionsCol = daily ? daily.columns.indexOf("sessions") : -1;
  const keyCol = daily ? daily.columns.indexOf("keyEvents") : -1;
  return (
    <div className="stack">
      {now && before ? (
        <Card title={`Last 28 days, to ${end}`}>
          <div className="stat-row" style={{ marginTop: 0 }}>
            <Kpi label="Sessions" value={now.sessions} previous={before.sessions} format={whole} />
            <Kpi label="Engaged sessions" value={now.engagedSessions} previous={before.engagedSessions} format={whole} />
            <Kpi label="Key events" value={now.keyEvents} previous={before.keyEvents} format={whole} />
            <Kpi label="New users" value={now.newUsers} previous={before.newUsers} format={whole} />
            {now.totalRevenue || before.totalRevenue ? (
              <Kpi label="Revenue" value={now.totalRevenue} previous={before.totalRevenue} format={(n) => formatNumber(n, 2)} />
            ) : null}
          </div>
          <p className="small muted" style={{ marginTop: "0.7rem" }}>
            Every channel, compared with the 28 days before. The organic-only view is the &ldquo;Landing pages,
            organic search&rdquo; report below. Users are not summed across days, because one person on two days
            is one user, not two.
          </p>
        </Card>
      ) : null}
      {daily ? (
        <Card title="16 months, week by week">
          <div className="grid grid-2">
            <Chart points={weekly(daily.rows, sessionsCol)} label="Sessions per week" format={(n) => formatNumber(n)} />
            <Chart points={weekly(daily.rows, keyCol)} label="Key events per week" format={(n) => formatNumber(n)} />
          </div>
        </Card>
      ) : null}
      <Explorer reports={reports} />
    </div>
  );
}

const PAGE_SIZE = 50;

function Explorer({ reports }: { reports: StoredReport[] }) {
  const [key, setKey] = useState(reports.find((r) => r.key === "queries" || r.key === "organicLanding")?.key ?? reports[0]?.key ?? "");
  const report = reports.find((r) => r.key === key) ?? reports[0];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; desc: boolean } | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setQuery("");
    setSort(null);
    setPage(0);
  }, [key]);

  const rows = useMemo(() => {
    if (!report) return [];
    const needle = query.trim().toLowerCase();
    let out = needle ? report.rows.filter((r) => r.some((c) => typeof c === "string" && c.toLowerCase().includes(needle))) : report.rows;
    if (sort) {
      out = out.slice().sort((a, b) => {
        const x = a[sort.col];
        const y = b[sort.col];
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort.desc ? -d : d;
      });
    }
    return out;
  }, [report, query, sort]);

  if (!report) return null;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function download() {
    const blob = new Blob([toCsv(report.columns, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.provider}-${report.key}-${report.endDate || isoDay(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Card
      title="Every report"
      action={
        <select value={report.key} onChange={(e) => setKey(e.target.value)} aria-label="Report">
          {reports.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label} ({formatNumber(r.rows.length)})
            </option>
          ))}
        </select>
      }
    >
      <p className="small">{report.note}</p>
      <p className="small muted">
        {report.startDate ? `${report.startDate} to ${report.endDate} · ` : ""}
        {formatNumber(report.rows.length)} rows
        {report.available != null && report.available > report.rows.length ? ` of ${formatNumber(report.available)} Google holds` : ""}
        {" · fetched "}
        {timeAgo(report.fetchedAt)}
      </p>
      {report.capped ? (
        <Notice kind="warn">
          This report reached its limit of {formatNumber(report.rows.length)} rows. The rows kept are the largest; the
          smallest are in Google but not here.
        </Notice>
      ) : null}
      {report.error ? (
        <Notice kind="warn" title="The latest sync of this report failed">
          {report.error} What is shown is the copy from {new Date(report.fetchedAt).toLocaleDateString()}.
        </Notice>
      ) : null}

      <div className="row" style={{ margin: "0.7rem 0" }}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Filter rows"
          aria-label="Filter rows"
          style={{ flex: "1 1 200px" }}
        />
        <button className="small" onClick={download} disabled={!rows.length}>
          Download CSV{query ? " (filtered)" : ""}
        </button>
      </div>

      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {report.columns.map((c, i) => {
                  const numeric = typeof report.rows[0]?.[i] === "number";
                  return (
                    <th
                      key={c}
                      className={numeric ? "num" : ""}
                      style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                      onClick={() => setSort(sort?.col === i ? { col: i, desc: !sort.desc } : { col: i, desc: numeric })}
                      aria-sort={sort?.col === i ? (sort.desc ? "descending" : "ascending") : "none"}
                    >
                      {heading(c)}
                      {sort?.col === i ? (sort.desc ? " ↓" : " ↑") : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className={typeof cell === "number" ? "num" : ""} style={{ maxWidth: "36ch", overflowWrap: "anywhere" }}>
                      {show(report.columns[c], cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small muted">{report.rows.length ? "No row matches that filter." : "Google returned no rows for this report."}</p>
      )}

      {pages > 1 ? (
        <div className="between small" style={{ marginTop: "0.7rem" }}>
          <button className="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">
            Page {page + 1} of {formatNumber(pages)}
          </span>
          <button className="small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </Card>
  );
}

const HEADINGS: Record<string, string> = {
  ctr: "click rate",
  position: "avg position",
  searchAppearance: "appearance",
  landingPagePlusQueryString: "landing page",
  sessionDefaultChannelGroup: "channel",
  sessionSource: "source",
  sessionMedium: "medium",
  pagePath: "page",
  eventName: "event",
  deviceCategory: "device",
  engagedSessions: "engaged sessions",
  engagementRate: "engagement rate",
  keyEvents: "key events",
  totalRevenue: "revenue",
  averageSessionDuration: "avg session",
  newUsers: "new users",
  totalUsers: "users",
  activeUsers: "active users",
  screenPageViews: "views",
  userEngagementDuration: "engagement time",
  eventCount: "events",
};

function heading(column: string): string {
  return HEADINGS[column] ?? column.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function show(column: string, cell: Cell): string {
  if (typeof cell !== "number") return cell;
  if (column === "ctr" || column === "engagementRate") return `${(cell * 100).toFixed(1)}%`;
  if (column === "position") return cell.toFixed(1);
  if (column === "averageSessionDuration" || column === "userEngagementDuration") return `${Math.round(cell)}s`;
  if (column === "totalRevenue") return formatNumber(cell, 2);
  return formatNumber(cell);
}
