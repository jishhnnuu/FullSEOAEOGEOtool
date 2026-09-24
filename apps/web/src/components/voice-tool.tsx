"use client";

import { useState } from "react";

import type { CrawledPage } from "@/engine/types";
import { RIVAL_FLOOR, WORD_FLOOR, compare, fingerprint, type VoiceFingerprint } from "@/engine/voice";

/*
 * The voice comparison, standalone and public.
 *
 * The content desk's one genuinely deterministic capability: it needs no model
 * key, no account and no connection. It was only reachable inside a workspace
 * that required a site to exist first, which meant nobody could see the desk
 * do anything before committing.
 *
 * The two refusals are the point. Under 120 words the ratios are arithmetic
 * rather than evidence, and under three readable rivals there is no field to
 * compare against, only one writer's habit.
 */

async function readPages(urls: string[]): Promise<CrawledPage[]> {
  const out: CrawledPage[] = [];
  // The route takes four at a time on purpose: an edge runtime bills CPU per
  // request, so this is several small calls rather than one long one.
  for (let i = 0; i < urls.length; i += 4) {
    const response = await fetch("/api/engine/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets: urls.slice(i, i + 4).map((url) => ({ url, depth: 0 })) }),
    });
    if (!response.ok) continue;
    const body = (await response.json()) as { pages?: CrawledPage[] };
    out.push(...(body.pages ?? []));
  }
  return out;
}

function normalise(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function label(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

export function VoiceTool({ defaultMine = "", defaultRivals = "" }: {
  defaultMine?: string;
  defaultRivals?: string;
}) {
  const [mine, setMine] = useState(defaultMine);
  const [rivals, setRivals] = useState(defaultRivals);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{
    mine: VoiceFingerprint;
    theirs: VoiceFingerprint[];
    comparison: ReturnType<typeof compare>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const mineUrl = normalise(mine);
    if (!mineUrl) { setError("That does not look like a web address."); return; }
    const rivalUrls = rivals.split(/[\s,\n]+/).map(normalise).filter((u): u is string => !!u).slice(0, 5);

    setError(null);
    setResult(null);
    setBusy("your page");
    try {
      const [minePage] = await readPages([mineUrl]);
      if (!minePage?.signals) {
        setError(`Could not read ${label(mineUrl)}. It may be blocking automated requests.`);
        return;
      }
      const mineFp = fingerprint(minePage.signals.text, label(mineUrl), mineUrl);

      setBusy(`${rivalUrls.length} rival page${rivalUrls.length === 1 ? "" : "s"}`);
      const rivalPages = rivalUrls.length ? await readPages(rivalUrls) : [];
      const theirs = rivalUrls.map((url) => {
        const page = rivalPages.find((p) => p.url === url || p.finalUrl === url);
        if (!page?.signals) {
          // A page we could not read is named, not silently dropped: the
          // sample size decides whether there is a verdict at all.
          return { ...fingerprint("", label(url), url), notes: [page?.error ?? "Did not answer."] };
        }
        return fingerprint(page.signals.text, label(url), url);
      });

      setResult({ mine: mineFp, theirs, comparison: compare(mineFp, theirs) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The read failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="tool-form" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 300px" }}>
          <span className="small">Your page</span>
          <input
            id="voice-mine"
            value={mine}
            onChange={(e) => setMine(e.target.value)}
            placeholder="yoursite.com/services"
          />
        </label>
        <button className="button primary" onClick={() => void run()} disabled={!!busy || !mine.trim()}>
          {busy ? `Reading ${busy}` : "Measure it"}
        </button>
      </div>

      <label style={{ display: "block", marginBottom: "0.9rem" }}>
        <span className="small">
          Pages you compete with, one per line. Three readable ones is the floor for a verdict.
        </span>
        <textarea
          id="voice-rivals"
          rows={4}
          value={rivals}
          onChange={(e) => setRivals(e.target.value)}
          placeholder={"rival-one.com/services\nrival-two.com/services\nrival-three.com/services"}
        />
      </label>

      {error && <div className="notice notice-bad">{error}</div>}

      {result && (
        <>
          <h3 className="section-title small-title" style={{ marginTop: "1.4rem" }}>
            How your page reads
          </h3>
          {result.mine.measured ? (
            <div className="tool-stats">
              <div className="tool-stat">
                <span className="tool-stat-value">{result.mine.rhythm.toFixed(2)}</span>
                <span className="tool-stat-label">
                  rhythm {result.mine.rhythm < 0.45 ? "— flatter than human prose usually runs" : ""}
                </span>
              </div>
              <div className="tool-stat">
                <span className="tool-stat-value">{result.mine.address}</span>
                <span className="tool-stat-label">
                  we {result.mine.wePer1k.toFixed(1)} / you {result.mine.youPer1k.toFixed(1)} per 1,000
                </span>
              </div>
              <div className="tool-stat">
                <span className="tool-stat-value">{result.mine.readingGrade.toFixed(1)}</span>
                <span className="tool-stat-label">reading grade</span>
              </div>
              <div className="tool-stat">
                <span className="tool-stat-value">{result.mine.fillerPer1k.toFixed(1)}</span>
                <span className="tool-stat-label">marketing filler per 1,000 words</span>
              </div>
            </div>
          ) : (
            <div className="notice notice-warn">{result.mine.notes[0]}</div>
          )}

          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
            The field
          </h3>
          <div className="check-list">
            {result.theirs.map((fp) => (
              <div className="check-row" key={fp.url ?? fp.label}>
                <span className={fp.measured ? "badge badge-ok" : "badge badge-medium"}>
                  {fp.measured ? "measured" : "unreadable"}
                </span>
                <span className="check-title">
                  <strong>{fp.label}</strong>
                  <span className="tiny faint">
                    {fp.measured
                      ? `rhythm ${fp.rhythm.toFixed(2)} · filler ${fp.fillerPer1k.toFixed(1)} · grade ${fp.readingGrade.toFixed(1)}`
                      : fp.notes[0]}
                  </span>
                </span>
                <span className="check-fix tiny faint">{fp.measured ? `${fp.words} words` : ""}</span>
              </div>
            ))}
            {result.theirs.length === 0 && (
              <div className="check-row">
                <span className="check-title small muted">
                  No rival pages given, so there is nothing to compare against.
                </span>
              </div>
            )}
          </div>

          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
            The verdict
          </h3>
          {result.comparison.measured ? (
            result.comparison.differences.length ? (
              <>
                <p className="small"><strong>{result.comparison.verdict}</strong></p>
                <div className="check-list">
                  {result.comparison.differences.map((d) => (
                    <div className="check-row" key={d.metric}>
                      <span className="badge badge-medium">{d.direction}</span>
                      <span className="check-title">
                        <strong>{d.label}</strong>
                        <span className="tiny faint">Your copy {d.readsAs} the field.</span>
                      </span>
                      <span className="check-fix mono tiny">
                        you {d.site} · them {d.rivalMedian}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="tool-note" style={{ marginTop: "1rem" }}>
                  Both numbers appear on every row on purpose. A recommendation without the number
                  behind it is an opinion, and differences inside the noise threshold are not shown
                  at all, because a tool that lists every tiny gap sounds certain about nothing.
                </p>
              </>
            ) : (
              <p className="small muted">
                Nothing past the materiality threshold. Your page reads like the field, which is a
                real answer rather than an empty one.
              </p>
            )
          ) : (
            <div className="notice notice-warn">
              <strong>No verdict.</strong> {result.comparison.reason}
            </div>
          )}
        </>
      )}

      {!result && !busy && (
        <p className="tool-note">
          Counting, not judgement: rhythm, hedging, marketing filler, specifics, reading grade and
          who the page talks about. No model reads it and no key is needed. Under {WORD_FLOOR} words
          the ratios are arithmetic rather than evidence and it says so, and under {RIVAL_FLOOR}{" "}
          readable rivals there is no verdict, because two pages is one writer&rsquo;s habit.
        </p>
      )}
    </div>
  );
}
