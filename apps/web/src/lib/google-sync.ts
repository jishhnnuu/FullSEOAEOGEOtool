"use client";

/**
 * The full Google sync, run from the browser.
 *
 * Every report in `engine/google-data.ts` is paged until Google runs out of
 * rows or the report's cap is reached. The Worker routes under
 * `/api/google/*` only attach the token and pass the body through, so parsing
 * a hundred thousand rows costs this tab a second rather than the Worker its
 * CPU budget.
 *
 * A failed report does not stop the sync. It is recorded against that report
 * by name, the previous copy (if there is one) is kept and labelled with the
 * date it came from, and the rest carry on. A sync that reports "done" with
 * half its reports missing would be the exact thing this product exists not
 * to do.
 */

import {
  GA4_REPORTS,
  GSC_REPORTS,
  INSPECTION_COLUMNS,
  SITEMAP_COLUMNS,
  ga4Day,
  ga4More,
  ga4Request,
  ga4Rows,
  gscColumns,
  gscMore,
  gscRequest,
  gscRows,
  inspectionRow,
  latestDay,
  newestDay,
  sitemapRows,
  type Cell,
  type Ga4ReportSpec,
  type GscReportSpec,
  type StoredReport,
} from "@/engine/google-data";
import { loadReports, saveMeta, saveReport } from "@/lib/google-store";

/** How many of the top pages get a URL Inspection. Google allows 2,000 a day per property. */
export const INSPECT_TOP = 25;

export type SyncProgress = { done: number; total: number; current: string; rows: number };

export type SyncInput = {
  siteId: string;
  gsc: { property: string } | null;
  ga4: { propertyId: string; name: string | null } | null;
  onProgress?: (progress: SyncProgress) => void;
};

export class GoogleCallError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  let wait = 1000;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
    if (response.ok) return parsed as T;

    // Rate limits and Google's own hiccups are retried twice, slowly. Anything
    // else is an answer, and retrying an answer only delays it.
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, wait));
      wait *= 3;
      continue;
    }
    const shaped = parsed as { message?: string; error?: { message?: string } };
    const message = shaped.error?.message ?? shaped.message ?? `Google answered ${response.status}.`;
    throw new GoogleCallError(message, response.status);
  }
}

function blank(provider: "gsc" | "ga4", key: string, label: string, note: string, columns: string[], startDate: string, endDate: string): StoredReport {
  return { provider, key, label, note, columns, rows: [], startDate, endDate, fetchedAt: new Date().toISOString(), capped: false, available: null, error: null };
}

function append(into: Cell[][], rows: Cell[][]): void {
  // A loop, not push(...rows): spreading 25,000 arguments can exceed the stack.
  for (const row of rows) into.push(row);
}

async function pullGsc(siteId: string, spec: GscReportSpec, latest: Date): Promise<StoredReport> {
  const first = gscRequest(spec, latest, 0);
  const report = blank("gsc", spec.key, spec.label, spec.note, gscColumns(spec), first.startDate, first.endDate);
  let startRow = 0;
  for (;;) {
    const request = gscRequest(spec, latest, startRow);
    const body = await call<{ rows?: never[] }>(`/api/google/gsc?site=${encodeURIComponent(siteId)}&op=query`, request);
    const page = gscRows(body.rows);
    append(report.rows, page);
    startRow += page.length;
    if (!gscMore(page.length, request.rowLimit, report.rows.length, spec.cap)) {
      report.capped = report.rows.length >= spec.cap;
      break;
    }
  }
  return report;
}

async function pullGa4(siteId: string, spec: Ga4ReportSpec, latest: Date): Promise<StoredReport> {
  const first = ga4Request(spec, latest, 0) as { dateRanges: { startDate: string; endDate: string }[] };
  const range = first.dateRanges[0];
  const report = blank("ga4", spec.key, spec.label, spec.note, [...spec.dimensions, ...spec.metrics], range.startDate, range.endDate);
  let offset = 0;
  for (;;) {
    const body = await call<{ rows?: never[]; rowCount?: number }>(
      `/api/google/ga4?site=${encodeURIComponent(siteId)}&op=report`,
      ga4Request(spec, latest, offset),
    );
    const page = ga4Rows(body);
    if (spec.dimensions[0] === "date") for (const row of page) row[0] = ga4Day(String(row[0]));
    append(report.rows, page);
    offset += page.length;
    report.available = body.rowCount ?? report.rows.length;
    if (!page.length || !ga4More(report.rows.length, report.available, spec.cap)) {
      report.capped = report.rows.length < report.available;
      break;
    }
  }
  return report;
}

/** Run tasks a few at a time, so a big sync does not trip Google's per-minute limits. */
async function pool<T>(tasks: (() => Promise<T>)[], width: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  async function lane() {
    while (next < tasks.length) {
      const i = next;
      next += 1;
      out[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, tasks.length) }, lane));
  return out;
}

export async function syncGoogle(input: SyncInput): Promise<{ errors: string[] }> {
  const started = Date.now();
  const { siteId } = input;
  const previous = new Map((await loadReports(siteId)).map((r) => [`${r.provider}:${r.key}`, r]));
  const errors: string[] = [];
  let rows = 0;
  let done = 0;
  // A refusal that will repeat for every report (not signed in, not
  // connected, access withdrawn) is reported once, not thirteen times.
  const fatal: { gsc: string | null; ga4: string | null } = { gsc: null, ga4: null };

  const gscSpecs = input.gsc ? GSC_REPORTS : [];
  const ga4Specs = input.ga4 ? GA4_REPORTS : [];
  const total = gscSpecs.length + ga4Specs.length + (input.gsc ? 2 : 0);
  const tick = (current: string) => input.onProgress?.({ done, total, current, rows });

  async function keep(provider: "gsc" | "ga4", key: string, label: string, run: () => Promise<StoredReport>): Promise<StoredReport | null> {
    tick(label);
    try {
      if (fatal[provider]) throw new GoogleCallError(fatal[provider]!, 0);
      const report = await run();
      rows += report.rows.length;
      await saveReport(siteId, report);
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const repeats = error instanceof GoogleCallError && [401, 403, 409, 503].includes(error.status);
      if (error instanceof GoogleCallError && error.status === 0) {
        // Already reported once.
      } else if (repeats) {
        fatal[provider] = message;
        errors.push(`${provider === "gsc" ? "Search Console" : "Analytics"}: ${message}`);
      } else errors.push(`${provider === "gsc" ? "Search Console" : "Analytics"}, ${label}: ${message}`);
      const old = previous.get(`${provider}:${key}`);
      // The old copy stays, carrying today's failure, so the screen can say
      // "from the sync on the 3rd; today's failed because ...".
      if (old) await saveReport(siteId, { ...old, error: message });
      return null;
    } finally {
      done += 1;
      tick(label);
    }
  }

  // Search Console first, and its daily report before anything else: the
  // newest day it holds is the true end of the data, and every other window
  // is counted back from it, so "the last 90 days" means 90 days of data.
  let gscNewest: string | null = null;
  if (input.gsc) {
    const [daily, ...rest] = gscSpecs;
    const dailyReport = await keep("gsc", daily.key, daily.label, () => pullGsc(siteId, daily, latestDay()));
    gscNewest = dailyReport ? newestDay(dailyReport) : null;
    const latest = gscNewest ? new Date(`${gscNewest}T00:00:00Z`) : latestDay();
    const results = await pool(
      rest.map((spec) => () => keep("gsc", spec.key, spec.label, () => pullGsc(siteId, spec, latest))),
      3,
    );

    await keep("gsc", "sitemaps", "Sitemaps", async () => {
      const body = await call<{ sitemap?: never[] }>(`/api/google/gsc?site=${encodeURIComponent(siteId)}&op=sitemaps`);
      const report = blank("gsc", "sitemaps", "Sitemaps", "Every sitemap Google has for this property, with when it last read each one.", SITEMAP_COLUMNS, "", "");
      report.rows = sitemapRows(body);
      return report;
    });

    // Inspect the pages that earn the most clicks: those are the ones where
    // an indexing or canonical problem costs real traffic.
    const pages = results[rest.findIndex((s) => s.key === "pages")];
    await keep("gsc", "inspection", "Index status of your top pages", async () => {
      const top = (pages?.rows ?? []).slice().sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, INSPECT_TOP).map((r) => String(r[0]));
      const report = blank(
        "gsc",
        "inspection",
        "Index status of your top pages",
        `URL Inspection for the ${top.length} pages with the most clicks. Google allows 2,000 inspections a day per property, so this is a sample by design.`,
        INSPECTION_COLUMNS,
        "",
        "",
      );
      const inspected = await pool(
        top.map((page) => async () => {
          try {
            return inspectionRow(page, await call(`/api/google/gsc?site=${encodeURIComponent(siteId)}&op=inspect`, { url: page }));
          } catch (error) {
            return [page, "not inspected", error instanceof Error ? error.message : String(error), "", "", "", "", "", "", "", ""];
          }
        }),
        2,
      );
      report.rows = inspected;
      return report;
    });
  }

  if (input.ga4) {
    const latest = latestDay();
    await pool(
      ga4Specs.map((spec) => () => keep("ga4", spec.key, spec.label, () => pullGa4(siteId, spec, latest))),
      3,
    );
  }

  await saveMeta({
    siteId,
    syncedAt: new Date().toISOString(),
    gscProperty: input.gsc?.property ?? null,
    ga4Property: input.ga4?.propertyId ?? null,
    ga4Name: input.ga4?.name ?? null,
    gscNewest,
    errors,
    seconds: Math.round((Date.now() - started) / 1000),
  });
  return { errors };
}

/** Whether stored data is old enough to refresh on arrival. */
export function stale(syncedAt: string | null | undefined, hours = 24): boolean {
  if (!syncedAt) return true;
  return Date.now() - Date.parse(syncedAt) > hours * 3_600_000;
}
