"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { fetchPage } from "@/engine/fetcher";
import { RIVAL_FLOOR, WORD_FLOOR, compare, fingerprint, type VoiceFingerprint } from "@/engine/voice";
import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Empty, Notice, PageHeader, formatNumber } from "@/components/ui";

/*
 * The voice desk.
 *
 * A recommendation to change how a company writes is one of the most
 * expensive things this platform can say, because acting on it means
 * rewriting a site. So it arrives with the client's number and the field's
 * median beside it, or it does not arrive at all.
 *
 * Both refusals on this screen are deliberate and neither is an error:
 * under 120 words the ratios are arithmetic rather than evidence, and under
 * three readable rivals there is no field, only one writer's habit.
 *
 * None of this needs a model key. It is counting, and the same counting runs
 * on the server installation from the same definitions.
 */

/** Policy and legal pages are excluded: they are written by a lawyer, not by the brand. */
const EXCLUDE = /\/(privacy|terms|cookie|legal|gdpr|accessibility|sitemap)/i;

function metric(value: number, digits = 1): string {
  return formatNumber(value, digits);
}

function rhythmNote(v: number): string {
  if (v === 0) return "Not enough sentences to vary.";
  if (v < 0.45) return "Flatter than human prose usually runs. The most reliable machine-writing tell after the dash.";
  if (v > 0.8) return "More varied than most business writing. Deliberate, or uneven.";
  return "Inside the range human prose usually sits in.";
}

export default function VoicePage() {
  const { site, result } = useSite();
  const [rivals, setRivals] = useState<VoiceFingerprint[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  /* Your own voice, from pages already crawled. Costs nothing and needs no key. */
  const mine = useMemo(() => {
    if (!result) return null;
    const pages = result.crawl.pages
      .filter((p) => p.signals && p.status === 200 && !EXCLUDE.test(p.url))
      .sort((a, b) => (b.signals?.wordCount ?? 0) - (a.signals?.wordCount ?? 0))
      .slice(0, 6);
    if (!pages.length) return null;
    const text = pages.map((p) => p.signals?.text ?? "").join("\n\n");
    return { fp: fingerprint(text, site?.domain ?? "your site"), pages: pages.length };
  }, [result, site?.domain]);

  if (!site) return null;

  if (!result) {
    return (
      <>
        <PageHeader title="Voice" />
        <Empty title="No run yet">
          <p className="small">
            <Link href={`/app/sites/${site.id}`}>Run the audit</Link> and your voice is measured from the pages it
            reads. Nothing extra is fetched for this.
          </p>
        </Empty>
      </>
    );
  }

  const competitors = site.competitors.filter(Boolean);
  const comparison = mine ? compare(mine.fp, rivals) : null;

  async function measureField() {
    setError(null);
    setTried(true);
    const found: VoiceFingerprint[] = [];
    try {
      for (const raw of competitors.slice(0, 5)) {
        let target: string;
        try {
          target = new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
        } catch {
          continue;
        }
        setBusy(target);
        const page = await fetchPage(target, 0);
        const host = new URL(target).hostname.replace(/^www\./, "");
        if (!page.signals) {
          // A rival we could not read is named, not silently dropped, because
          // the sample size is the thing that decides whether there is a verdict.
          found.push({ ...fingerprint("", host, target), notes: [page.error ?? `Returned ${page.status}.`] });
          continue;
        }
        found.push(fingerprint(page.signals.text, host, target));
      }
      setRivals(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the field.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Voice"
        description="How you write, measured, against how the pages you compete with write. Counting rather than judgement: no model reads this and no key is needed."
        action={
          competitors.length > 0 ? (
            <button className="primary" onClick={() => void measureField()} disabled={!!busy}>
              {busy ? "Reading the field" : rivals.length ? "Measure again" : "Measure the field"}
            </button>
          ) : null
        }
      />

      {busy && <Notice kind="ok">Reading {busy}</Notice>}
      {error && <Notice kind="bad">{error}</Notice>}

      {!mine && (
        <Empty title="Nothing long enough to measure">
          <p className="small">
            The crawl found no page with enough body copy. Voice ratios need about {WORD_FLOOR} words before they
            mean anything.
          </p>
        </Empty>
      )}

      {mine && (
        <Card
          title="Your voice"
          action={<span className="tiny faint">{mine.pages} pages, {formatNumber(mine.fp.words)} words</span>}
        >
          {!mine.fp.measured ? (
            <Notice kind="warn" title="Not reported as measured">{mine.fp.notes[0]}</Notice>
          ) : (
            <>
              <div className="voice-grid">
                <div className="voice-metric">
                  <div className="k">Rhythm</div>
                  <div className="v">{metric(mine.fp.rhythm, 2)}</div>
                  <div className="n">{rhythmNote(mine.fp.rhythm)}</div>
                </div>
                <div className="voice-metric">
                  <div className="k">Address</div>
                  <div className="v" style={{ fontSize: "1rem", paddingTop: "0.3rem" }}>{mine.fp.address}</div>
                  <div className="n">we {metric(mine.fp.wePer1k)} / you {metric(mine.fp.youPer1k)} per 1,000 words</div>
                </div>
                <div className="voice-metric">
                  <div className="k">Reading grade</div>
                  <div className="v">{metric(mine.fp.readingGrade)}</div>
                  <div className="n">Mean sentence {metric(mine.fp.sentenceLenMean)} words, longest {mine.fp.sentenceLenMax}.</div>
                </div>
                <div className="voice-metric">
                  <div className="k">Marketing filler</div>
                  <div className="v">{metric(mine.fp.fillerPer1k)}</div>
                  <div className="n">Per 1,000 words. The vocabulary that signals a page written to fill a slot.</div>
                </div>
                <div className="voice-metric">
                  <div className="k">Specifics</div>
                  <div className="v">{metric(mine.fp.concretePer1k)}</div>
                  <div className="n">Figures, dates and quantities. A page empty of these is describing itself.</div>
                </div>
                <div className="voice-metric">
                  <div className="k">Hedges</div>
                  <div className="v">{metric(mine.fp.hedgesPer1k)}</div>
                  <div className="n">Copy that survived a legal review and helps nobody.</div>
                </div>
              </div>
              {mine.fp.dashCount > 0 && (
                <p className="tiny faint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
                  {mine.fp.dashCount} em or en dash{mine.fp.dashCount === 1 ? "" : "es"} used as punctuation. It is the
                  single most reliable machine-writing tell, and the humanizer removes it from anything drafted here.
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {competitors.length === 0 && (
        <Notice kind="warn" title="No rivals named yet">
          There is no field to compare against until you name some.{" "}
          <Link href={`/app/sites/${site.id}/settings`}>Add competitors</Link> and this desk will read their pages and
          measure them the same way.
        </Notice>
      )}

      {rivals.length > 0 && (
        <Card title="The field" action={<span className="tiny faint">{rivals.filter((r) => r.measured).length} of {rivals.length} readable</span>}>
          <div className="stack-sm">
            {rivals.map((r) => (
              <div key={r.label} className="between small">
                <span className="truncate">
                  {r.measured
                    ? <Badge kind="ok">measured</Badge>
                    : <Badge kind="warn">not readable</Badge>}{" "}
                  {r.label}
                </span>
                <span className="tiny faint nums">
                  {r.measured
                    ? `rhythm ${metric(r.rhythm, 2)} · filler ${metric(r.fillerPer1k)} · grade ${metric(r.readingGrade)}`
                    : r.notes[0]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {comparison && tried && !comparison.measured && (
        <Notice kind="warn" title="No verdict">
          {comparison.reason} Naming {RIVAL_FLOOR - comparison.sampleSize} more readable competitor
          {RIVAL_FLOOR - comparison.sampleSize === 1 ? "" : "s"} would produce one. A verdict on fewer is one
          writer&rsquo;s habit presented as a norm, and asking you to rewrite your site against it would be the
          expensive kind of wrong.
        </Notice>
      )}

      {comparison?.measured && (
        <Card
          title="Where you differ"
          action={<span className="tiny faint">across {comparison.sampleSize} measured rivals</span>}
        >
          <p className="small" style={{ marginTop: 0 }}><strong>{comparison.verdict}</strong></p>
          {comparison.differences.length === 0 ? (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Nothing past the materiality threshold. Differences smaller than that are inside the noise, and a tool
              that lists every tiny gap sounds certain about nothing.
            </p>
          ) : (
            <div>
              {comparison.differences.map((d) => (
                <div key={d.metric} className="diff-row">
                  <span>
                    <strong>{d.label}.</strong>{" "}
                    <span className="muted">Your copy {d.readsAs} the field.</span>
                  </span>
                  <span className="small nums">
                    you <strong>{metric(d.site, 2)}</strong> · them <strong>{metric(d.rivalMedian, 2)}</strong>
                  </span>
                  <span className="tiny faint nums">
                    range {metric(d.rivalRange[0], 2)}&ndash;{metric(d.rivalRange[1], 2)}
                  </span>
                </div>
              ))}
              <p className="tiny faint" style={{ marginTop: "0.9rem", marginBottom: 0 }}>
                Both numbers are printed on every row on purpose. A recommendation without the number behind it is an
                opinion, and this does not ship opinions as findings.
              </p>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
