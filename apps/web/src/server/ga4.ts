/**
 * Analytics 4, read-only.
 *
 * `analytics.readonly` is a sensitive scope. Until Google has reviewed the
 * consent screen it works for accounts listed as testers and for nobody else,
 * which is fine while the product is being tested and is the reason the review
 * is worth starting on day one. Nothing here writes to a property.
 */

import { accessToken, type ConnectionRow } from "./connections";
import type { Env } from "./env";

export type Ga4Property = { name: string; displayName: string; propertyId: string; account: string };

/** Every GA4 property this account can read. */
export async function properties(e: Env, row: ConnectionRow): Promise<Ga4Property[]> {
  const token = await accessToken(e, row);
  const response = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Analytics admin answered ${response.status}: ${body.slice(0, 300)}`);
  }
  const parsed = (await response.json()) as {
    accountSummaries?: {
      account?: string;
      displayName?: string;
      propertySummaries?: { property?: string; displayName?: string }[];
    }[];
  };
  const out: Ga4Property[] = [];
  for (const account of parsed.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      out.push({
        name: property.property,
        displayName: property.displayName ?? property.property,
        propertyId: property.property.replace("properties/", ""),
        account: account.displayName ?? "",
      });
    }
  }
  return out;
}

export type ReportRow = { dimensions: string[]; metrics: number[] };

export type Report = { dimensionHeaders: string[]; metricHeaders: string[]; rows: ReportRow[] };

/** One report. Dimensions and metrics are named by the caller, not guessed. */
export async function report(
  e: Env,
  row: ConnectionRow,
  options: { propertyId: string; dimensions: string[]; metrics: string[]; days?: number; limit?: number },
): Promise<Report> {
  const token = await accessToken(e, row);
  const days = options.days ?? 28;
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(options.propertyId)}:runReport`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: options.dimensions.map((name) => ({ name })),
        metrics: options.metrics.map((name) => ({ name })),
        limit: String(Math.min(options.limit ?? 100, 10_000)),
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Analytics data answered ${response.status}: ${body.slice(0, 300)}`);
  }
  const parsed = (await response.json()) as {
    dimensionHeaders?: { name: string }[];
    metricHeaders?: { name: string }[];
    rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  };
  return {
    dimensionHeaders: (parsed.dimensionHeaders ?? []).map((h) => h.name),
    metricHeaders: (parsed.metricHeaders ?? []).map((h) => h.name),
    rows: (parsed.rows ?? []).map((r) => ({
      dimensions: (r.dimensionValues ?? []).map((v) => v.value),
      metrics: (r.metricValues ?? []).map((v) => Number(v.value) || 0),
    })),
  };
}
