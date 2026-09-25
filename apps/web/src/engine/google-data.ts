/**
 * What a full Google sync asks for, and how to read what comes back.
 *
 * "All the data" has a precise meaning here, because both APIs have limits
 * that a vague promise would hide:
 *
 *  - Search Console keeps 16 months of performance data. Totals by day come
 *    back complete. Tables by query or page come back as the rows Google
 *    keeps, largest first, 25,000 per request; rare queries are anonymised
 *    and left out entirely, so a query table always adds up to less than the
 *    daily totals. Every report says which of those it is.
 *  - Analytics 4 answers any report the property has data for, 250,000 rows
 *    per request at most, paged by offset.
 *
 * Each report is paged until Google runs out of rows or the cap is reached,
 * and a capped report says so rather than looking complete. Nothing in this
 * file touches the network: the browser's sync (`lib/google-sync.ts`) does
 * the calls, and everything here is plain functions that can be tested.
 */

export type GscType = "web" | "discover" | "image" | "video" | "news";

export type GscReportSpec = {
  key: string;
  label: string;
  dimensions: string[];
  type: GscType;
  /** Days back from the latest day, inclusive: [start, end]. */
  window: { from: number; to: number };
  /** Most rows to keep. Google pages at 25,000. */
  cap: number;
  /** What the rows are, in a sentence, shown above the table. */
  note: string;
};

const SIXTEEN_MONTHS = 486;
const PAGE = 25_000;

export const GSC_REPORTS: GscReportSpec[] = [
  { key: "daily", label: "Every day, web search", dimensions: ["date"], type: "web", window: { from: SIXTEEN_MONTHS - 1, to: 0 }, cap: 1000, note: "Complete daily totals for web search, as far back as Google keeps them." },
  { key: "queries", label: "Queries", dimensions: ["query"], type: "web", window: { from: 89, to: 0 }, cap: 100_000, note: "The last 90 days. Google leaves out rare queries it anonymises, so these add up to less than the daily totals." },
  { key: "queriesPrev", label: "Queries, the 90 days before", dimensions: ["query"], type: "web", window: { from: 179, to: 90 }, cap: 100_000, note: "The 90 days before the latest 90, for comparison." },
  { key: "pages", label: "Pages", dimensions: ["page"], type: "web", window: { from: 89, to: 0 }, cap: 100_000, note: "The last 90 days, every page Google showed in results." },
  { key: "pagesPrev", label: "Pages, the 90 days before", dimensions: ["page"], type: "web", window: { from: 179, to: 90 }, cap: 100_000, note: "The 90 days before the latest 90, for comparison." },
  { key: "queryPage", label: "Query and page", dimensions: ["query", "page"], type: "web", window: { from: 27, to: 0 }, cap: 100_000, note: "The last 28 days: which page answered which query. This is what shows two pages competing for one search." },
  { key: "countries", label: "Countries", dimensions: ["country"], type: "web", window: { from: 89, to: 0 }, cap: 1000, note: "The last 90 days." },
  { key: "devices", label: "Devices", dimensions: ["device"], type: "web", window: { from: 89, to: 0 }, cap: 100, note: "The last 90 days." },
  { key: "appearance", label: "Search appearance", dimensions: ["searchAppearance"], type: "web", window: { from: 89, to: 0 }, cap: 100, note: "The last 90 days: rich results, videos and other result types you appeared as." },
  { key: "dailyDiscover", label: "Every day, Discover", dimensions: ["date"], type: "discover", window: { from: SIXTEEN_MONTHS - 1, to: 0 }, cap: 1000, note: "Google Discover, daily. Empty if you have never appeared there." },
  { key: "dailyImage", label: "Every day, image search", dimensions: ["date"], type: "image", window: { from: SIXTEEN_MONTHS - 1, to: 0 }, cap: 1000, note: "Google Images, daily." },
  { key: "dailyVideo", label: "Every day, video search", dimensions: ["date"], type: "video", window: { from: SIXTEEN_MONTHS - 1, to: 0 }, cap: 1000, note: "Video results, daily." },
  { key: "dailyNews", label: "Every day, news", dimensions: ["date"], type: "news", window: { from: SIXTEEN_MONTHS - 1, to: 0 }, cap: 1000, note: "The News tab, daily." },
];

export type Ga4ReportSpec = {
  key: string;
  label: string;
  dimensions: string[];
  metrics: string[];
  window: { from: number; to: number };
  cap: number;
  note: string;
  /** Only organic search sessions. */
  organic?: boolean;
};

const LANDING_METRICS = ["sessions", "engagedSessions", "engagementRate", "keyEvents", "totalRevenue", "averageSessionDuration", "newUsers"];

export const GA4_REPORTS: Ga4ReportSpec[] = [
  { key: "daily", label: "Every day", dimensions: ["date"], metrics: ["sessions", "totalUsers", "newUsers", "engagedSessions", "keyEvents", "totalRevenue", "screenPageViews"], window: { from: SIXTEEN_MONTHS - 1, to: 0 }, cap: 1000, note: "Daily totals for 16 months, the same span as Search Console." },
  { key: "landing", label: "Landing pages", dimensions: ["landingPagePlusQueryString"], metrics: LANDING_METRICS, window: { from: 89, to: 0 }, cap: 100_000, note: "The last 90 days, every channel." },
  { key: "organicLanding", label: "Landing pages, organic search", dimensions: ["landingPagePlusQueryString"], metrics: LANDING_METRICS, window: { from: 89, to: 0 }, cap: 100_000, organic: true, note: "The last 90 days, sessions that came from organic search only." },
  { key: "channels", label: "Channels", dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "engagedSessions", "keyEvents", "totalRevenue"], window: { from: 89, to: 0 }, cap: 100, note: "The last 90 days, by Google's default channel grouping." },
  { key: "sourceMedium", label: "Source and medium", dimensions: ["sessionSource", "sessionMedium"], metrics: ["sessions", "engagedSessions", "keyEvents", "totalRevenue"], window: { from: 89, to: 0 }, cap: 10_000, note: "The last 90 days." },
  { key: "pages", label: "Pages viewed", dimensions: ["pagePath"], metrics: ["screenPageViews", "activeUsers", "userEngagementDuration", "keyEvents"], window: { from: 89, to: 0 }, cap: 100_000, note: "The last 90 days, every page that was viewed, not only where sessions began." },
  { key: "events", label: "Events and key events", dimensions: ["eventName"], metrics: ["eventCount", "keyEvents"], window: { from: 89, to: 0 }, cap: 1000, note: "The last 90 days. Key events are the ones marked as conversions in Analytics." },
  { key: "devices", label: "Devices", dimensions: ["deviceCategory"], metrics: ["sessions", "engagedSessions", "keyEvents"], window: { from: 89, to: 0 }, cap: 100, note: "The last 90 days." },
  { key: "countries", label: "Countries", dimensions: ["country"], metrics: ["sessions", "engagedSessions", "keyEvents"], window: { from: 89, to: 0 }, cap: 1000, note: "The last 90 days." },
];

/* ------------------------------------------------------------ dates */

/** A day as YYYY-MM-DD, in UTC so a sync near midnight does not shift a day. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The start and end dates of a window, counted back from `latest`.
 *
 * Search Console's newest complete day is usually two or three days old and
 * it never says so, which is how tools report a cliff that is really just the
 * edge of the data. `latest` is therefore yesterday, and whatever Google does
 * not have yet simply comes back empty.
 */
export function windowDates(window: { from: number; to: number }, latest: Date): { startDate: string; endDate: string } {
  const day = 86_400_000;
  return {
    startDate: isoDay(new Date(latest.getTime() - window.from * day)),
    endDate: isoDay(new Date(latest.getTime() - window.to * day)),
  };
}

export function latestDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

/* ------------------------------------------------------------ paging */

/** The Search Analytics request for one page of a report. */
export function gscRequest(spec: GscReportSpec, latest: Date, startRow: number) {
  const { startDate, endDate } = windowDates(spec.window, latest);
  return {
    startDate,
    endDate,
    dimensions: spec.dimensions,
    type: spec.type,
    rowLimit: Math.min(PAGE, spec.cap - startRow),
    startRow,
  };
}

/** Whether to ask for another page, given how many rows the last page returned. */
export function gscMore(returned: number, requested: number, kept: number, cap: number): boolean {
  return returned === requested && requested > 0 && kept < cap;
}

/** The Data API request for one page of a report. */
export function ga4Request(spec: Ga4ReportSpec, latest: Date, offset: number) {
  const { startDate, endDate } = windowDates(spec.window, latest);
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    dimensions: spec.dimensions.map((name) => ({ name })),
    metrics: spec.metrics.map((name) => ({ name })),
    limit: String(Math.min(PAGE, spec.cap - offset)),
    offset: String(offset),
  };
  if (spec.organic) {
    body.dimensionFilter = {
      filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } },
    };
  }
  if (spec.dimensions[0] === "date") body.orderBys = [{ dimension: { dimensionName: "date" } }];
  else body.orderBys = [{ metric: { metricName: spec.metrics[0] }, desc: true }];
  return body;
}

export function ga4More(kept: number, rowCount: number, cap: number): boolean {
  return kept < rowCount && kept < cap;
}

/* ------------------------------------------------------------ stored shape */

export type Cell = string | number;

/**
 * One report, as stored in the browser. Rows are arrays rather than objects
 * because a hundred thousand rows of repeated keys is most of the storage.
 */
export type StoredReport = {
  provider: "gsc" | "ga4";
  key: string;
  label: string;
  note: string;
  columns: string[];
  rows: Cell[][];
  startDate: string;
  endDate: string;
  fetchedAt: string;
  /** True when the cap was reached before Google ran out of rows. */
  capped: boolean;
  /** Rows Google says exist, where it says (Analytics does, Search Console does not). */
  available: number | null;
  error: string | null;
};

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

export function gscRows(rows: GscRow[] | undefined): Cell[][] {
  return (rows ?? []).map((r) => [...(r.keys ?? []), r.clicks ?? 0, r.impressions ?? 0, r.ctr ?? 0, r.position ?? 0]);
}

export function gscColumns(spec: GscReportSpec): string[] {
  return [...spec.dimensions, "clicks", "impressions", "ctr", "position"];
}

type Ga4Response = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  rowCount?: number;
};

export function ga4Rows(body: Ga4Response): Cell[][] {
  return (body.rows ?? []).map((r) => [
    ...(r.dimensionValues ?? []).map((v) => v.value ?? ""),
    ...(r.metricValues ?? []).map((v) => Number(v.value) || 0),
  ]);
}

/* ------------------------------------------------------------ reading */

export type Totals = { clicks: number; impressions: number; ctr: number; position: number; days: number };

/**
 * Search Console totals between two dates, from the daily report.
 * Position is weighted by impressions, which is how Google computes it.
 */
export function gscTotals(daily: StoredReport, from: string, to: string): Totals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  let days = 0;
  for (const row of daily.rows) {
    const date = String(row[0]);
    if (date < from || date > to) continue;
    const c = Number(row[1]);
    const i = Number(row[2]);
    clicks += c;
    impressions += i;
    weighted += Number(row[4]) * i;
    days += 1;
  }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? weighted / impressions : 0, days };
}

/** The last day present in a daily report, which is the newest day Google has. */
export function newestDay(daily: StoredReport): string | null {
  let newest: string | null = null;
  for (const row of daily.rows) {
    const d = String(row[0]);
    if (!newest || d > newest) newest = d;
  }
  return newest;
}

/** Two back-to-back periods of `days`, ending on the newest day with data. */
export function periods(newest: string, days: number): { current: [string, string]; previous: [string, string] } {
  const end = new Date(`${newest}T00:00:00Z`).getTime();
  const day = 86_400_000;
  const current: [string, string] = [isoDay(new Date(end - (days - 1) * day)), newest];
  const previous: [string, string] = [isoDay(new Date(end - (2 * days - 1) * day)), isoDay(new Date(end - days * day))];
  return { current, previous };
}

/** Analytics dates arrive as YYYYMMDD. */
export function ga4Day(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

/** Sum each metric column of a daily Analytics report between two dates. */
export function ga4Totals(daily: StoredReport, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  const metricCols = daily.columns.slice(1);
  metricCols.forEach((c) => (out[c] = 0));
  for (const row of daily.rows) {
    const date = ga4Day(String(row[0]));
    if (date < from || date > to) continue;
    metricCols.forEach((c, i) => (out[c] += Number(row[i + 1]) || 0));
  }
  return out;
}

/* ------------------------------------------------------------ matching properties to a site */

/** The bare host of an address, without www. */
export function bareHost(address: string): string {
  try {
    const url = new URL(address.includes("://") ? address : `https://${address}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return address.replace(/^sc-domain:/, "").replace(/^www\./, "").toLowerCase();
  }
}

/**
 * How well a Search Console property matches a site. 3: a domain property
 * for it. 2: a URL-prefix property on the same host. 0: someone else's.
 */
export function gscMatch(site: string, property: string): number {
  const host = bareHost(site);
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length).toLowerCase();
    return host === domain || host.endsWith(`.${domain}`) ? 3 : 0;
  }
  return bareHost(property) === host ? 2 : 0;
}

/** How well an Analytics property matches: its web stream's address (2), or its name (1). */
export function ga4Match(site: string, property: { displayName: string; urls: string[] }): number {
  const host = bareHost(site);
  if (property.urls.some((u) => bareHost(u) === host)) return 2;
  return property.displayName.toLowerCase().includes(host) ? 1 : 0;
}

/**
 * The one property to choose without asking, or null when the choice is
 * genuinely ambiguous: nothing matches, or two match equally well.
 */
export function pickBest<T>(items: T[], score: (item: T) => number): T | null {
  if (items.length === 1) return items[0];
  const scored = items.map((item) => ({ item, s: score(item) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].s === scored[1].s) return null;
  return scored[0].item;
}

/* ------------------------------------------------------------ export */

export function toCsv(columns: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

/* ------------------------------------------------------------ charts */

/**
 * Daily rows summed into whole weeks, ending on the newest day.
 *
 * Sixteen months of days is five hundred points of weekday rhythm, and a line
 * read from its first point to its last compares a Monday with a Sunday. Weeks
 * remove that. The oldest partial week is dropped rather than drawn low.
 */
export function weekly(rows: Cell[][], column: number): { at: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(ga4Day(String(row[0])), Number(row[column]) || 0);
  if (!byDay.size) return [];
  const days = [...byDay.keys()].sort();
  const first = Date.parse(`${days[0]}T00:00:00Z`);
  const last = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  const day = 86_400_000;
  const out: { at: string; value: number }[] = [];
  for (let end = last; end - 6 * day >= first; end -= 7 * day) {
    let sum = 0;
    for (let d = end - 6 * day; d <= end; d += day) sum += byDay.get(isoDay(new Date(d))) ?? 0;
    out.push({ at: isoDay(new Date(end)), value: sum });
  }
  return out.reverse();
}

/* ------------------------------------------------------------ sitemaps and inspection */

type Sitemap = {
  path?: string;
  type?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  warnings?: string | number;
  errors?: string | number;
  contents?: { type?: string; submitted?: string | number }[];
};

export const SITEMAP_COLUMNS = ["sitemap", "type", "lastSubmitted", "lastDownloaded", "pending", "urlsSubmitted", "warnings", "errors"];

export function sitemapRows(body: { sitemap?: Sitemap[] }): Cell[][] {
  return (body.sitemap ?? []).map((s) => [
    s.path ?? "",
    s.type ?? "",
    s.lastSubmitted ?? "",
    s.lastDownloaded ?? "",
    s.isPending ? "yes" : "no",
    (s.contents ?? []).reduce((n, c) => n + (Number(c.submitted) || 0), 0),
    Number(s.warnings) || 0,
    Number(s.errors) || 0,
  ]);
}

type Inspection = {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      indexingState?: string;
      robotsTxtState?: string;
      pageFetchState?: string;
      lastCrawlTime?: string;
      googleCanonical?: string;
      userCanonical?: string;
      crawledAs?: string;
    };
    richResultsResult?: { verdict?: string; detectedItems?: { richResultType?: string }[] };
  };
};

export const INSPECTION_COLUMNS = [
  "page",
  "verdict",
  "coverage",
  "lastCrawl",
  "crawledAs",
  "fetch",
  "robotsTxt",
  "googleCanonical",
  "yourCanonical",
  "canonicalAgrees",
  "richResults",
];

/**
 * One row of URL Inspection. `canonicalAgrees` is the column worth reading:
 * a page whose chosen canonical differs from Google's is a page Google has
 * decided to rank as something else.
 */
export function inspectionRow(page: string, body: Inspection): Cell[] {
  const s = body.inspectionResult?.indexStatusResult ?? {};
  const rich = body.inspectionResult?.richResultsResult;
  const agrees = !s.googleCanonical || !s.userCanonical ? "" : s.googleCanonical === s.userCanonical ? "yes" : "no";
  return [
    page,
    s.verdict ?? "",
    s.coverageState ?? "",
    s.lastCrawlTime ?? "",
    s.crawledAs ?? "",
    s.pageFetchState ?? "",
    s.robotsTxtState ?? "",
    s.googleCanonical ?? "",
    s.userCanonical ?? "",
    agrees,
    rich ? [rich.verdict ?? "", ...(rich.detectedItems ?? []).map((i) => i.richResultType ?? "")].filter(Boolean).join(", ") : "",
  ];
}
