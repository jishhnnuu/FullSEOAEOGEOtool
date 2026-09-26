import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { allComparisons } from "@/content/compare";
import { BRAND } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Compare",
  description:
    "Honest comparisons against Search Atlas, Semrush, Profound and an SEO agency. Every page says when to buy theirs instead.",
  alternates: { canonical: "/compare" },
};

export default function ComparePage() {
  const comparisons = allComparisons();
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Compare", path: "/compare" },
            ]),
          ),
        }}
      />
      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Comparison</div>
        <h1 className="hero-title">Us vs the other tools. <span className="hl">Fairly.</span></h1>
        <p className="hero-lede">Every comparison includes when you should buy theirs instead. Prices carry the date we checked them.</p>
      </section>

      <section className="section section-tight">
        <div className="card-grid">
          {comparisons.map((comparison) => (
            <Link key={comparison.slug} href={`/compare/${comparison.slug}`} className="card link-card">
              <h3>Versus {comparison.name}</h3>
              <p className="small muted">{comparison.oneLine}</p>
              <span className="small">Checked {comparison.asOf}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The two facts that decide most of these</h2>
        <p className="section-lede">
          No major AI crawler executes JavaScript, and a fix you do not own reverts when you stop paying. Between them
          those two facts explain why an entire category can sell an AI visibility dashboard and a script-injected
          schema fix on the same screen without the second ever helping the first.
        </p>
        <p>
          <Link href="/ai-crawlers-and-javascript" className="button">
            Read the measurement behind that
          </Link>
        </p>
      </section>

      <CtaBand
        title={`Run ${BRAND} against your own site first`}
        body="No account, no card, no connections. The audit is the comparison that matters."
        primary={{ href: "/app/new", label: "Check my site free" }}
        secondary={{ href: "/book", label: "Or talk to a person" }}
      />
    </MarketingChrome>
  );
}
