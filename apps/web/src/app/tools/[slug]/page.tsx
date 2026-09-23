import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingChrome } from "@/components/marketing";
import { ToolPage } from "@/components/tool-page";
import { TOOLS_BY_SLUG, allTools } from "@/content/tools";
import { CATALOG } from "@/engine/catalog";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

export function generateStaticParams() {
  return allTools().map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = TOOLS_BY_SLUG.get(slug);
  if (!tool) return {};
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: `/tools/${tool.slug}` },
  };
}

export default async function ToolRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = TOOLS_BY_SLUG.get(slug);
  if (!tool) notFound();

  const checks = tool.checks.map((code) => CATALOG[code]).filter(Boolean);

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Free tools", path: "/tools" },
              { name: tool.name, path: `/tools/${tool.slug}` },
            ]),
            faqNode(tool.faq),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">
          <Link href="/tools">Free tools</Link>
        </div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}>
          {tool.name}
        </h1>
        <p className="section-lede">{tool.description}</p>
      </section>

      {/* The interactive part. Everything around it is server-rendered on
          purpose, so a crawler that runs no JavaScript still gets the page. */}
      <ToolPage tool={tool} />

      <section className="section section-tight">
        <h2 className="section-title small-title">What this is actually checking</h2>
        {tool.explains.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      {checks.length ? (
        <section className="section section-tight">
          <h2 className="section-title small-title">The checks behind it</h2>
          <p className="section-lede">
            These are the same entries the full audit uses, with the same severities and the same recommended fixes.
          </p>
          <ul className="tool-check-list">
            {checks.map((check) => (
              <li key={check.code}>
                <span className={`pill ${check.severity}`}>{check.severity}</span>
                <div>
                  <strong>{check.title}</strong>
                  <p className="small muted">{check.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section section-tight">
        <h2 className="section-title small-title">Questions</h2>
        <div className="faq">
          {tool.faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Other tools</h2>
        <div className="card-grid">
          {allTools()
            .filter((other) => other.slug !== tool.slug)
            .slice(0, 6)
            .map((other) => (
              <Link key={other.slug} href={`/tools/${other.slug}`} className="card link-card">
                <h3>{other.name}</h3>
                <p className="small muted">{other.blurb}</p>
              </Link>
            ))}
        </div>
      </section>
    </MarketingChrome>
  );
}
