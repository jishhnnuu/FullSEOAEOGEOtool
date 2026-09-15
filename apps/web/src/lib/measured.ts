"use client";

/**
 * Measured data, as opposed to modelled data.
 *
 * The distinction runs through the whole product. Without Search Console the
 * keyword list is tf-idf over the site's own copy: an honest statement of what
 * the site is currently about, and not a claim about demand. With it, the same
 * screen shows the queries people actually typed. Both are useful. Only one is
 * a measurement, and a screen must never let a reader confuse them.
 *
 * Every hook here returns a `reason` when it has nothing, so the screen can say
 * why rather than showing an empty table.
 */

import useSWR from "swr";

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export type GscPerformance = {
  property: string;
  rows: GscRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
};

export type Ga4Report = {
  propertyId: string;
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: { dimensions: string[]; metrics: number[] }[];
};

export type Measured<T> = {
  data: T | null;
  loading: boolean;
  /** Why there is nothing, in a sentence fit to put on the screen. */
  reason: string | null;
  /** What to do about it, when there is something to do. */
  fix: string | null;
  /** True when the account simply has not connected this yet. */
  notConnected: boolean;
};

type Failure = { code?: string; message?: string; fix?: string };

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  const body = (await response.json()) as T & Failure;
  if (!response.ok) {
    const error = new Error(body.message ?? `That request answered ${response.status}.`) as Error & Failure;
    error.code = body.code;
    error.fix = body.fix;
    throw error;
  }
  return body as T;
}

function shape<T>(data: T | undefined, error: (Error & Failure) | undefined, loading: boolean, enabled: boolean): Measured<T> {
  if (!enabled) {
    return { data: null, loading: false, reason: null, fix: null, notConnected: false };
  }
  if (error) {
    const code = error.code ?? "";
    return {
      data: null,
      loading: false,
      reason: error.message,
      fix: error.fix ?? null,
      notConnected: code === "not_connected" || code === "no_property" || code === "not_signed_in",
    };
  }
  return { data: data ?? null, loading, reason: null, fix: null, notConnected: false };
}

/** Search Console queries for a site, or the reason there are none. */
export function useSearchQueries(
  enabled: boolean,
  options: { siteId?: string; days?: number; dimensions?: string; limit?: number } = {},
): Measured<GscPerformance> {
  const params = new URLSearchParams();
  if (options.siteId) params.set("site", options.siteId);
  if (options.days) params.set("days", String(options.days));
  if (options.dimensions) params.set("dimensions", options.dimensions);
  if (options.limit) params.set("limit", String(options.limit));

  const { data, error, isLoading } = useSWR<GscPerformance, Error & Failure>(
    enabled ? `/api/data/gsc?${params.toString()}` : null,
    read,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return shape(data, error, isLoading, enabled);
}

/** Analytics rows for a site, or the reason there are none. */
export function useAnalytics(
  enabled: boolean,
  options: { siteId?: string; days?: number; dimensions?: string; metrics?: string; limit?: number } = {},
): Measured<Ga4Report> {
  const params = new URLSearchParams();
  if (options.siteId) params.set("site", options.siteId);
  if (options.days) params.set("days", String(options.days));
  if (options.dimensions) params.set("dimensions", options.dimensions);
  if (options.metrics) params.set("metrics", options.metrics);
  if (options.limit) params.set("limit", String(options.limit));

  const { data, error, isLoading } = useSWR<Ga4Report, Error & Failure>(
    enabled ? `/api/data/ga4?${params.toString()}` : null,
    read,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return shape(data, error, isLoading, enabled);
}
