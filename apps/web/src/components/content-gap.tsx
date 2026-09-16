"use client";

/**
 * Page against page.
 *
 * Every tool in this category will tell you a competitor's domain rating and
 * leave it there, which is true and useless: you cannot do anything about
 * their domain this week. This compares one of your pages against the pages
 * that beat it on the things you can change by Friday, and it says which of
 * your pages is worth the effort first, from impressions and position rather
 * than from a feeling.
 *
 * The limitation is stated rather than hidden: without a SERP source the
 * platform does not know which pages outrank you, so the competing URLs are
 * ones you name or ones found on the rivals you named. What it does with them
 * once it has them is measured.
 */

import { useMemo, useState } from "react";

import { Badge, Card, Notice, shortUrl } from "@/components/ui";
import { useSearchQueries } from "@/lib/measured";
import { comparePage, pagesWorthComparing, profileOf, type PageComparison } from "@/engine/content-gap";
import type { AuditResult, CrawledPage } from "@/engine/types";

export function ContentGap({
  result,
  signedIn,
  siteId,
  competitors,
}: {
  result: AuditResult;
  signedIn: boolean;
  siteId: string;
  competitors: string[];
}) {
  const search = useSearchQueries(signedIn, { siteId, days: 28, dimensions: "page", limit: 100 });

  const worth = useMemo(() => {
    const queries = search.data?.rows.map((row) => ({
      page: row.keys[0],
      impressions: row.impressions,
      position: row.position,
    }));
    return pagesWorthComparing(result.crawl.pages, queries && queries.length > 0 ? { queries } : {});
  }, [result, search.data]);

  const [chosen, setChosen] = useState<string>("");
  const [rivals, setRivals] = useState<string>("");
  const [comparison, setComparison] = useState<PageComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = chosen || worth[0]?.url || "";
  const ourPage = result.crawl.pages.find((page) => page.url === target) ?? null;

  async function run() {
    setError(null);
    setComparison(null);
    const urls = rivals
      .split(/[\s,]+/)
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!ourPage) {
      setError("Pick one of your pages first.");
      return;
    }
    const ours = profileOf(ourPage);
    if (!ours) {
      setError("That page did not return a readable response in the last crawl, so there is nothing to compare.");
      return;
    }
    if (urls.length === 0) {
      setError("Give at least one competing URL. Without a SERP source the platform cannot know which pages outrank you, and guessing would waste the most expensive work in the programme.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/engine/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets: urls.map((url) => ({ url, depth: 1 })) }),
      });
      const body = (await response.json()) as { pages?: CrawledPage[]; message?: string };
      if (!response.ok) throw new Error(body.message ?? `That request answered ${response.status}.`);

      const theirs = (body.pages ?? []).map(profileOf).filter((profile): profile is NonNullable<typeof profile> => profile !== null);
      if (theirs.length === 0) {
        setError("None of those URLs returned a readable page. A page behind a login or a JavaScript shell cannot be compared, and neither can it be read by an answer engine.");
        return;
      }
      setComparison(comparePage(ours, theirs));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title="Which of your pages is worth the work">
        <p className="small muted">
          {search.data
            ? "Ranked by what is actually at stake: pages with impressions sitting between position five and thirty. They already qualify, they are just not being chosen."
            : "Search Console is not connected, so this is ranked by depth and commercial intent rather than by what is close to ranking. That is a proxy, and a worse one."}
        </p>

        {worth.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Nothing on the site is substantial enough to be worth a page-level comparison yet.
          </p>
        ) : (
          <div className="stack-sm">
            {worth.slice(0, 8).map((item) => (
              <label key={item.url} className="row small" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                <input
                  type="radio"
                  name="gap-target"
                  checked={target === item.url}
                  onChange={() => setChosen(item.url)}
                  style={{ width: "auto", marginTop: "0.2rem" }}
                />
                <span style={{ minWidth: 0 }}>
                  <span className="mono tiny">{shortUrl(item.url, 64)}</span>
                  <div className="tiny faint">{item.why}</div>
                </span>
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card title="The pages it is up against">
        <p className="small muted">
          Paste up to three URLs that beat this page. {competitors.length > 0 ? `You named ${competitors.join(", ")} as rivals, so their version of this page is the place to start.` : "The ones ranking above you for the query you want."}
        </p>
        <label className="field">
          <span className="rule-label">Competing URLs, one per line</span>
          <textarea
            rows={3}
            value={rivals}
            onChange={(event) => setRivals(event.target.value)}
            placeholder={"https://rival.example/guide\nhttps://other.example/what-it-costs"}
          />
        </label>
        <div className="button-row">
          <button type="button" className="primary" onClick={() => void run()} disabled={busy || !target}>
            {busy ? "Reading them" : "Compare"}
          </button>
          <span className="tiny faint">Fetched live, parsed with the same checks that ran on your own site.</span>
        </div>
        {error ? <Notice kind="bad">{error}</Notice> : null}
      </Card>

      {comparison ? <Comparison comparison={comparison} /> : null}
    </>
  );
}

function Comparison({ comparison }: { comparison: PageComparison }) {
  const serious = comparison.differences.filter((difference) => difference.weight >= 0.5);
  return (
    <>
      <Card title="The verdict">
        <p>{comparison.verdict}</p>
        <dl className="kv">
          <dt>Your page</dt>
          <dd className="small">
            {comparison.ours.title} <span className="tiny faint mono">{shortUrl(comparison.ours.url, 56)}</span>
          </dd>
          <dt>Compared against</dt>
          <dd className="small">
            {comparison.theirs.map((profile) => (
              <div key={profile.url} className="tiny mono truncate">
                {shortUrl(profile.url, 56)}
              </div>
            ))}
          </dd>
        </dl>
      </Card>

      <Card title={`What is different · ${comparison.differences.length}`}>
        {comparison.differences.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Nothing measurable separates them. If this page is still behind, the difference is authority or intent
            match, and neither is closed by editing the page.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>What</th>
                  <th>Them</th>
                  <th>You</th>
                  <th>The job</th>
                </tr>
              </thead>
              <tbody>
                {comparison.differences.map((difference) => (
                  <tr key={difference.key}>
                    <td>
                      <Badge kind={difference.weight >= 0.7 ? "high" : difference.weight >= 0.5 ? "medium" : "low"}>
                        {difference.key.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="small">{difference.them}</td>
                    <td className="small">{difference.you}</td>
                    <td className="small muted">{difference.close}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {serious.length > 0 ? (
          <p className="tiny faint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
            {serious.length} of these are substantive rather than cosmetic. Close those and leave the rest: a page that
            matches a rival on word count and still loses was never losing on word count.
          </p>
        ) : null}
      </Card>
    </>
  );
}
