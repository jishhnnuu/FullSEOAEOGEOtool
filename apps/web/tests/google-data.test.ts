import assert from "node:assert/strict";
import test from "node:test";

import {
  GA4_REPORTS,
  GSC_REPORTS,
  bareHost,
  ga4Match,
  ga4More,
  ga4Request,
  ga4Rows,
  ga4Totals,
  gscMatch,
  gscMore,
  gscRequest,
  gscRows,
  gscTotals,
  inspectionRow,
  latestDay,
  newestDay,
  periods,
  pickBest,
  sitemapRows,
  toCsv,
  weekly,
  windowDates,
  type StoredReport,
} from "../src/engine/google-data";

const LATEST = new Date("2026-09-20T00:00:00Z");

function report(columns: string[], rows: (string | number)[][]): StoredReport {
  return { provider: "gsc", key: "daily", label: "", note: "", columns, rows, startDate: "", endDate: "", fetchedAt: "", capped: false, available: null, error: null };
}

test("the daily Search Console report asks for all sixteen months Google keeps", () => {
  const daily = GSC_REPORTS.find((r) => r.key === "daily")!;
  const request = gscRequest(daily, LATEST, 0);
  assert.equal(request.endDate, "2026-09-20");
  assert.equal(request.startDate, "2025-05-23");
  const days = (Date.parse(request.endDate) - Date.parse(request.startDate)) / 86_400_000 + 1;
  assert.equal(days, 486);
  assert.deepEqual(request.dimensions, ["date"]);
});

test("windows count back from the newest day, inclusive, and the comparison period does not overlap", () => {
  const now = windowDates({ from: 89, to: 0 }, LATEST);
  const before = windowDates({ from: 179, to: 90 }, LATEST);
  assert.equal(now.endDate, "2026-09-20");
  assert.equal(now.startDate, "2026-06-23");
  assert.equal(before.endDate, "2026-06-22");
  assert.equal(before.startDate, "2026-03-25");
});

test("latestDay is yesterday in UTC, whatever the local hour", () => {
  assert.equal(latestDay(new Date("2026-09-21T00:30:00Z")).toISOString().slice(0, 10), "2026-09-20");
  assert.equal(latestDay(new Date("2026-09-21T23:59:00Z")).toISOString().slice(0, 10), "2026-09-20");
});

test("Search Console pages 25,000 rows at a time and stops at the cap or when Google runs out", () => {
  const queries = GSC_REPORTS.find((r) => r.key === "queries")!;
  assert.equal(gscRequest(queries, LATEST, 0).rowLimit, 25_000);
  assert.equal(gscRequest(queries, LATEST, 25_000).startRow, 25_000);
  assert.equal(gscRequest(queries, LATEST, 90_000).rowLimit, 10_000, "the last page asks only for what the cap allows");
  assert.equal(gscMore(25_000, 25_000, 25_000, 100_000), true, "a full page means there may be more");
  assert.equal(gscMore(1_200, 25_000, 26_200, 100_000), false, "a short page is the end");
  assert.equal(gscMore(10_000, 10_000, 100_000, 100_000), false, "the cap stops it");
  assert.equal(gscMore(0, 25_000, 25_000, 100_000), false);
});

test("Analytics pages by offset against the row count it reports", () => {
  const landing = GA4_REPORTS.find((r) => r.key === "landing")!;
  const body = ga4Request(landing, LATEST, 25_000) as { offset: string; limit: string; orderBys: unknown[] };
  assert.equal(body.offset, "25000");
  assert.equal(body.limit, "25000");
  assert.equal(ga4More(25_000, 60_000, 100_000), true);
  assert.equal(ga4More(60_000, 60_000, 100_000), false);
  assert.equal(ga4More(100_000, 400_000, 100_000), false);
});

test("the organic report filters to organic search, and only that one", () => {
  const organic = GA4_REPORTS.find((r) => r.key === "organicLanding")!;
  const all = GA4_REPORTS.find((r) => r.key === "landing")!;
  const filtered = ga4Request(organic, LATEST, 0) as { dimensionFilter?: { filter: { stringFilter: { value: string } } } };
  assert.equal(filtered.dimensionFilter?.filter.stringFilter.value, "Organic Search");
  assert.equal((ga4Request(all, LATEST, 0) as { dimensionFilter?: unknown }).dimensionFilter, undefined);
});

test("every report key is unique within its provider", () => {
  for (const list of [GSC_REPORTS, GA4_REPORTS]) {
    const keys = list.map((r) => r.key);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("rows are flattened to arrays, keys first", () => {
  assert.deepEqual(gscRows([{ keys: ["seo tool"], clicks: 3, impressions: 40, ctr: 0.075, position: 4.2 }]), [["seo tool", 3, 40, 0.075, 4.2]]);
  assert.deepEqual(gscRows(undefined), []);
  assert.deepEqual(
    ga4Rows({ rows: [{ dimensionValues: [{ value: "/pricing" }], metricValues: [{ value: "12" }, { value: "0.5" }] }] }),
    [["/pricing", 12, 0.5]],
  );
});

test("totals weight position by impressions, the way Google does", () => {
  const daily = report(["date", "clicks", "impressions", "ctr", "position"], [
    ["2026-09-01", 10, 100, 0.1, 2],
    ["2026-09-02", 0, 900, 0, 12],
    ["2026-08-01", 99, 99, 1, 1],
  ]);
  const t = gscTotals(daily, "2026-09-01", "2026-09-02");
  assert.equal(t.clicks, 10);
  assert.equal(t.impressions, 1000);
  assert.equal(t.ctr, 0.01);
  assert.equal(t.position, 11, "(2*100 + 12*900) / 1000, not the plain mean of 7");
  assert.equal(t.days, 2);
});

test("periods are back to back and end on the newest day with data", () => {
  const p = periods("2026-09-20", 28);
  assert.deepEqual(p.current, ["2026-08-24", "2026-09-20"]);
  assert.deepEqual(p.previous, ["2026-07-27", "2026-08-23"]);
  const daily = report(["date"], [["2026-09-18"], ["2026-09-17"]]);
  assert.equal(newestDay(daily), "2026-09-18");
});

test("Analytics totals read either date format", () => {
  const daily = report(["date", "sessions", "keyEvents"], [
    ["20260901", 5, 1],
    ["2026-09-02", 7, 0],
  ]);
  assert.deepEqual(ga4Totals(daily, "2026-09-01", "2026-09-02"), { sessions: 12, keyEvents: 1 });
});

test("weekly sums whole weeks ending on the newest day and drops the partial oldest one", () => {
  const rows: (string | number)[][] = [];
  for (let d = 1; d <= 16; d += 1) rows.push([`2026-09-${String(d).padStart(2, "0")}`, 1]);
  const weeks = weekly(rows, 1);
  assert.deepEqual(weeks, [
    { at: "2026-09-09", value: 7 },
    { at: "2026-09-16", value: 7 },
  ]);
  assert.deepEqual(weekly([], 1), []);
});

test("a missing day inside a week counts as zero rather than shifting the week", () => {
  const rows = [["2026-09-01", 1], ["2026-09-07", 1]];
  assert.deepEqual(weekly(rows, 1), [{ at: "2026-09-07", value: 2 }]);
});

test("a domain property beats a URL-prefix one, and someone else's site scores nothing", () => {
  assert.equal(bareHost("https://www.Example.com/path"), "example.com");
  assert.equal(gscMatch("https://www.example.com/", "sc-domain:example.com"), 3);
  assert.equal(gscMatch("https://shop.example.com/", "sc-domain:example.com"), 3);
  assert.equal(gscMatch("https://example.com/", "https://www.example.com/"), 2);
  assert.equal(gscMatch("https://example.com/", "sc-domain:notexample.com"), 0);
  assert.equal(gscMatch("https://example.com/", "https://example.org/"), 0);
});

test("an Analytics web stream beats a name that merely mentions the domain", () => {
  assert.equal(ga4Match("https://example.com", { displayName: "Main", urls: ["https://www.example.com"] }), 2);
  assert.equal(ga4Match("https://example.com", { displayName: "example.com - GA4", urls: [] }), 1);
  assert.equal(ga4Match("https://example.com", { displayName: "Other", urls: ["https://other.com"] }), 0);
});

test("pickBest chooses only when the answer is not in doubt", () => {
  const score = (p: string) => gscMatch("https://example.com", p);
  assert.equal(pickBest(["sc-domain:example.com", "https://example.com/", "https://other.com/"], score), "sc-domain:example.com");
  assert.equal(pickBest(["https://other.com/"], score), "https://other.com/", "one property is chosen, and the screen flags a mismatch");
  assert.equal(pickBest(["https://other.com/", "https://another.com/"], score), null, "nothing matches: ask");
  assert.equal(pickBest(["https://example.com/", "https://www.example.com/"], score), null, "a tie: ask");
  assert.equal(pickBest([], score), null);
});

test("sitemaps sum the URLs submitted across content types", () => {
  const rows = sitemapRows({
    sitemap: [{ path: "https://example.com/sitemap.xml", type: "sitemap", isPending: false, warnings: "1", errors: "0", contents: [{ type: "web", submitted: "40" }, { type: "image", submitted: "10" }] }],
  });
  assert.deepEqual(rows[0], ["https://example.com/sitemap.xml", "sitemap", "", "", "no", 50, 1, 0]);
});

test("inspection says whether Google agrees with the canonical", () => {
  const agree = inspectionRow("https://example.com/a", { inspectionResult: { indexStatusResult: { verdict: "PASS", googleCanonical: "https://example.com/a", userCanonical: "https://example.com/a" } } });
  const disagree = inspectionRow("https://example.com/b", { inspectionResult: { indexStatusResult: { verdict: "NEUTRAL", googleCanonical: "https://example.com/", userCanonical: "https://example.com/b" } } });
  const unknown = inspectionRow("https://example.com/c", {});
  assert.equal(agree[9], "yes");
  assert.equal(disagree[9], "no");
  assert.equal(unknown[9], "", "no canonical from Google is not a disagreement");
});

test("CSV quotes what needs quoting and nothing else", () => {
  assert.equal(toCsv(["query", "clicks"], [["plain", 1], ['say "hi", now', 2], ["two\nlines", 3]]), 'query,clicks\nplain,1\n"say ""hi"", now",2\n"two\nlines",3');
});
