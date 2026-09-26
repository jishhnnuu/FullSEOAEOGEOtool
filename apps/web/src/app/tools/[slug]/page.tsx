import Link from "next/link";
import { notFound } from "next/navigation";

import { Seat } from "@/components/seat";
import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Sprig } from "@/components/sprig";
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

      <section className="section fresh-hero seat-room" style={{ paddingBottom: "1.2rem" }}>
        <h1 className="hero-title" style={{ fontSize: "clamp(2rem, 5vw, 3.4rem)" }}>
          <Seat text={tool.name} word={tool.name.split(" ")[0]} />
        </h1>
        <p className="hero-lede">{tool.blurb}</p>
        <p className="hero-status">
          <span className="dot" aria-hidden="true" />
          <span><Link href="/tools">Free tools</Link> &middot; no signup</span>
        </p>
      </section>

      {/* The interactive part. Everything around it is server-rendered on
          purpose, so a crawler that runs no JavaScript still gets the page. */}
      <ToolPage tool={tool} />

      <section className="section section-alt">
        <h2 className="section-title">The nerdy bit.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>What this is actually checking</summary>
            <div className="acc-body">
              <p>{tool.description}</p>
              {tool.explains.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </details>
          {checks.length ? (
            <details className="acc">
              <summary>The {checks.length} check{checks.length === 1 ? "" : "s"} behind it</summary>
              <div className="acc-body">
                <p>The same entries the full audit uses, with the same severities and fixes.</p>
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
              </div>
            </details>
          ) : null}
          {tool.faq.map((item) => (
            <details className="acc" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body"><p>{item.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Try another.</h2>
        <div className="mini-tools" style={{ marginTop: "1.2rem" }}>
          {allTools()
            .filter((other) => other.slug !== tool.slug)
            .slice(0, 6)
            .map((other) => (
              <Link key={other.slug} href={`/tools/${other.slug}`} className="mini-tool">
                <strong>{other.name}</strong>
                <span>{other.blurb}</span>
              </Link>
            ))}
        </div>
      </section>

      <CtaBand title="Or check everything at once." body="The full check reads your whole site and writes every fix. Free, no signup." primary={{ href: "/app/new", label: "Check any website's SEO" }} secondary={{ href: "/book", label: "Or talk to a specialist" }} />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="search" />
    </MarketingChrome>
  );
}
