import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { GLOSSARY_BY_SLUG, allGlossary } from "@/content/glossary";
import { breadcrumbNode, definedTermNode, graph } from "@/lib/schema";

export function generateStaticParams() {
  return allGlossary().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = GLOSSARY_BY_SLUG.get(slug);
  if (!entry) return {};
  return {
    title: entry.term,
    description: entry.definition,
    alternates: { canonical: `/glossary/${entry.slug}` },
  };
}

export default async function GlossaryEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = GLOSSARY_BY_SLUG.get(slug);
  if (!entry) notFound();

  const related = (entry.seeAlso ?? [])
    .map((s) => GLOSSARY_BY_SLUG.get(s))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Glossary", path: "/glossary" },
              { name: entry.term, path: `/glossary/${entry.slug}` },
            ]),
            definedTermNode({ term: entry.term, definition: entry.definition, path: `/glossary/${entry.slug}` }),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">
          <Link href="/glossary">Glossary</Link>
        </div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}>
          {entry.term}
        </h1>
        {/*
          The definition is the first paragraph and it stands alone with no
          preceding context, because that is the unit an answer engine quotes.
          Every other page on this site holds to the same rule, which is the
          one `no_direct_answer` enforces against everyone else.
        */}
        <p className="section-lede">{entry.definition}</p>
      </section>

      <section className="section section-tight">
        {entry.body.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        {entry.relatedTo ? (
          <p>
            <Link href={entry.relatedTo.href} className="button">
              {entry.relatedTo.label}
            </Link>
          </p>
        ) : null}
      </section>

      {related.length ? (
        <section className="section section-tight">
          <h2 className="section-title small-title">Related</h2>
          <div className="card-grid">
            {related.map((other) => (
              <Link key={other.slug} href={`/glossary/${other.slug}`} className="card link-card">
                <h3>{other.term}</h3>
                <p className="small muted">{other.definition}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <CtaBand />
    </MarketingChrome>
  );
}
