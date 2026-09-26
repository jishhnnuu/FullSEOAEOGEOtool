import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { allGlossary } from "@/content/glossary";
import { BRAND, url } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Search and AI visibility glossary",
  description:
    "Definitions for the terms that decide search and AI answer visibility: AEO, GEO, extractability, entities, llms.txt, structured data, striking distance and more.",
  alternates: { canonical: "/glossary" },
};

export default function GlossaryPage() {
  const entries = allGlossary();
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Glossary", path: "/glossary" },
            ]),
            {
              "@type": "DefinedTermSet",
              "@id": url("/glossary#set"),
              name: `${BRAND} search glossary`,
              url: url("/glossary"),
              hasDefinedTerm: entries.map((entry) => ({
                "@type": "DefinedTerm",
                name: entry.term,
                description: entry.definition,
                url: url(`/glossary/${entry.slug}`),
              })),
            },
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Glossary</div>
        <h1 className="hero-title">Marketing jargon, <span className="hl">decoded.</span></h1>
        <p className="hero-lede">{entries.length} terms, each one linked to the check or fix that acts on it.</p>
      </section>

      <section className="section section-tight">
        <dl className="glossary-list">
          {entries.map((entry) => (
            <div key={entry.slug}>
              <dt>
                <Link href={`/glossary/${entry.slug}`}>{entry.term}</Link>
              </dt>
              <dd className="muted">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <CtaBand
        title="Definitions are cheap. The audit is the useful part."
        body="Run it on your own site and see which of these terms is currently costing you something."
        primary={{ href: "/app/new", label: "Check any website's SEO" }}
        secondary={{ href: "/book", label: "Or talk to a specialist" }}
      />
    </MarketingChrome>
  );
}
