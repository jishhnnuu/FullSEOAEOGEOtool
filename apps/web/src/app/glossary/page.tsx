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

      <section className="section">
        <div className="eyebrow">Glossary</div>
        <h1 className="section-title">The terms that actually decide anything.</h1>
        <p className="section-lede">
          {entries.length} definitions, each one for a term this product implements a check or a fix for. A glossary
          of words the software does not touch is padding, so there is no entry here that does not link to the thing
          that acts on it.
        </p>
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
      />
    </MarketingChrome>
  );
}
