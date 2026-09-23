import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { COMPARISONS_BY_SLUG, allComparisons } from "@/content/compare";
import { BRAND } from "@/lib/brand";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

export function generateStaticParams() {
  return allComparisons().map((comparison) => ({ slug: comparison.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comparison = COMPARISONS_BY_SLUG.get(slug);
  if (!comparison) return {};
  return {
    title: comparison.title,
    description: comparison.description,
    alternates: { canonical: `/compare/${comparison.slug}` },
  };
}

export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comparison = COMPARISONS_BY_SLUG.get(slug);
  if (!comparison) notFound();

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Compare", path: "/compare" },
              { name: `Versus ${comparison.name}`, path: `/compare/${comparison.slug}` },
            ]),
            faqNode(comparison.faq),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">
          <Link href="/compare">Comparison</Link> · checked {comparison.asOf}
        </div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          {BRAND} against {comparison.name}
        </h1>
        {/*
          The one-line answer comes before anything else on the page. A reader
          who leaves after one sentence should still have the honest summary,
          and it is also the passage an answer engine extracts.
        */}
        <p className="section-lede">{comparison.oneLine}</p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The context</h2>
        {comparison.context.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Side by side</h2>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>{comparison.name}</th>
                <th>{BRAND}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.points.map((point) => (
                <tr key={point.category}>
                  <th scope="row">{point.category}</th>
                  <td className="muted">{point.them}</td>
                  <td>{point.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Why people choose this</h2>
        <div className="card-grid">
          {comparison.ours.map((item) => (
            <div className="card" key={item.heading}>
              <h3>{item.heading}</h3>
              <p className="small muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/*
        The section that makes the rest of the page credible. It is required by
        the type, so a comparison cannot ship without one.
      */}
      <section className="section section-tight" id="when-theirs">
        <h2 className="section-title small-title">When to buy {comparison.name} instead</h2>
        <p className="section-lede">
          These are real. If one of them describes you, we would rather you bought theirs than churned in month two.
        </p>
        <div className="card-grid">
          {comparison.theirs.map((item) => (
            <div className="card muted-card" key={item.heading}>
              <h3>{item.heading}</h3>
              <p className="small muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What moving actually involves</h2>
        {comparison.switching.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Questions</h2>
        <div className="faq">
          {comparison.faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand
        title="The audit is the comparison that matters"
        body="Run it on your own site. No account, no card, and you keep everything it produces."
      />
    </MarketingChrome>
  );
}
