import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { CATALOG, CATEGORY_LABEL, byCategory } from "@/engine/catalog";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

export function generateStaticParams() {
  return Object.keys(CATALOG).map((code) => ({ code }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const def = CATALOG[code];
  if (!def) return {};
  return {
    title: def.title,
    description: `${def.why} ${def.recommendation}`.slice(0, 250),
    alternates: { canonical: `/library/${def.code}` },
  };
}

/*
 * One check, addressable on its own URL.
 *
 * Everything on this page is read from the catalogue the crawler actually
 * runs, so a check cannot be described here more favourably than it behaves.
 * The severity, the weighting and the fix strategy are the same values the
 * scoring uses.
 */

export default async function CheckPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const def = CATALOG[code];
  if (!def) notFound();

  const siblings = byCategory()[def.category].filter((d) => d.code !== def.code).slice(0, 8);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Check library", path: "/library" },
              { name: def.title, path: `/library/${def.code}` },
            ]),
            faqNode([
              { q: `What is ${def.title.toLowerCase()}?`, a: def.why },
              { q: "How do you fix it?", a: def.recommendation },
              {
                q: "Does the engine fix this itself?",
                a: def.autoFixable
                  ? "Yes. The corrected artefact is generated and queued for your approval, then pushed and re-fetched to confirm it went live."
                  : "No. This one needs a decision a person has to make, so it is reported with the evidence rather than changed automatically.",
              },
            ]),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">
          <Link href="/library">Check library</Link> &middot; {CATEGORY_LABEL[def.category] ?? def.category}
        </div>
        <h1 className="section-title">{def.title}</h1>
        <div className="check-meta">
          <span className={`badge badge-${def.severity}`}>{def.severity}</span>
          <span className="mono tiny">{def.code}</span>
          {def.autoFixable
            ? <span className="badge badge-ok">fix written automatically</span>
            : <span className="badge badge-neutral">needs a decision</span>}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Why it matters</h2>
        <p>{def.why}</p>

        <h2 className="section-title small-title" style={{ marginTop: "1.6rem" }}>What to do about it</h2>
        <p>{def.recommendation}</p>
        {def.autoFixable ? (
          <p className="small" style={{ color: "var(--ok)" }}>
            The engine generates this fix itself{def.fixStrategy ? ` using the ${def.fixStrategy} strategy` : ""}. It
            arrives in your queue as a complete artefact, because an incomplete fix never reaches the queue, and once
            you approve it the change is pushed and the page re-fetched to confirm it is live.
          </p>
        ) : (
          <p className="small muted">
            This one is reported rather than applied. It needs a judgement a person has to make, and applying it
            automatically would be a change to your site that nobody decided on.
          </p>
        )}

        <h2 className="section-title small-title" style={{ marginTop: "1.6rem" }}>How it is weighted</h2>
        <p className="small muted">
          These are the values the scoring actually uses, not a description of them. Priority is derived from all
          three rather than chosen, which is why a high-impact, low-effort finding surfaces above a severe one that
          would take a quarter to fix.
        </p>
        <dl className="kv">
          <dt>Severity</dt><dd>{def.severity}</dd>
          <dt>Impact</dt><dd>{pct(def.impact)} of the weight this category can carry</dd>
          <dt>Effort</dt><dd>{pct(def.effort)}, where 100% is a project rather than a change</dd>
          <dt>Confidence</dt><dd>{pct(def.confidence)} that a hit is a real problem rather than a pattern we misread</dd>
          <dt>Area</dt><dd>{CATEGORY_LABEL[def.category] ?? def.category}</dd>
        </dl>
        {def.confidence < 0.8 && (
          <p className="small" style={{ color: "var(--warn)" }}>
            Confidence under 80% is deliberate. This check is narrowed so it fires less often, because a wrong
            high-severity finding teaches you to discount the severe ones, which are the only ones that matter.
          </p>
        )}
      </section>

      {siblings.length > 0 && (
        <section className="section section-alt">
          <h2 className="section-title small-title">Other checks in {CATEGORY_LABEL[def.category] ?? def.category}</h2>
          <div className="check-list">
            {siblings.map((s) => (
              <Link href={`/library/${s.code}`} className="check-row" key={s.code}>
                <span className={`badge badge-${s.severity}`}>{s.severity}</span>
                <span className="check-title">
                  <strong>{s.title}</strong>
                  <span className="tiny faint mono">{s.code}</span>
                </span>
                <span className="check-fix">
                  {s.autoFixable ? <span className="written">fix written</span> : <span className="tiny faint">needs a decision</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CtaBand
        title="Check your own site for this"
        body="The whole catalogue over a real crawl, in about four minutes, in your browser. No account and no card."
        primary={{ href: "/thymelab/seo/audit", label: "See what we would fix this week" }}
        secondary={{ href: "/library", label: "Back to the library" }}
      />
    </MarketingChrome>
  );
}
