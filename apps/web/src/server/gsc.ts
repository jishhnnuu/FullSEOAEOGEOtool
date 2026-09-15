/**
 * Search Console, read-only.
 *
 * The scope is `webmasters.readonly`, which Google reclassified as
 * non-sensitive in 2024: no app review, no hundred-user cap. Everything here
 * is a GET or a report query; nothing submits, deletes or verifies anything.
 */

import { accessToken, type ConnectionRow } from "./connections";
import type { Env } from "./env";

const BASE = "https://searchconsole.googleapis.com/webmasters/v3";

export type Property = { siteUrl: string; permissionLevel: string };

async function call<T>(e: Env, row: ConnectionRow, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(e, row);
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Search Console answered ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

/** Every property this Google account can already see. Never creates one. */
export async function properties(e: Env, row: ConnectionRow): Promise<Property[]> {
  const body = await call<{ siteEntry?: Property[] }>(e, row, "/sites");
  return (body.siteEntry ?? []).filter((p) => p.permissionLevel !== "siteUnverifiedUser");
}

export type QueryRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export type Performance = {
  rows: QueryRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
};

/**
 * A performance report.
 *
 * Search Console's data lags by two to three days and it never says so, which
 * is how tools end up reporting a cliff that is really just the edge of the
 * window. The caller chooses the window; `sinceDays` defaults to a 28-day
 * period ending three days ago for exactly that reason.
 */
export async function performance(
  e: Env,
  row: ConnectionRow,
  options: {
    property: string;
    dimensions?: string[];
    days?: number;
    lagDays?: number;
    rowLimit?: number;
    page?: string;
  },
): Promise<Performance> {
  const lag = options.lagDays ?? 3;
  const days = options.days ?? 28;
  const end = new Date(Date.now() - lag * 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const body: Record<string, unknown> = {
    startDate: iso(start),
    endDate: iso(end),
    dimensions: options.dimensions ?? ["query"],
    rowLimit: Math.min(options.rowLimit ?? 250, 25_000),
  };
  if (options.page) {
    body.dimensionFilterGroups = [
      { filters: [{ dimension: "page", operator: "equals", expression: options.page }] },
    ];
  }

  const result = await call<{ rows?: QueryRow[] }>(
    e,
    row,
    `/sites/${encodeURIComponent(options.property)}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const rows = result.rows ?? [];
  const clicks = rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
  const impressions = rows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
  const weighted = rows.reduce((sum, r) => sum + (r.position ?? 0) * (r.impressions ?? 0), 0);
  return {
    rows,
    totals: {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? weighted / impressions : 0,
    },
  };
}

/** Whether Google has this URL indexed, and what it says about the canonical. */
export async function inspect(e: Env, row: ConnectionRow, property: string, url: string): Promise<unknown> {
  const token = await accessToken(e, row);
  const response = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`URL inspection answered ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}
