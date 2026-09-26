import Link from "next/link";
import { notFound } from "next/navigation";

import { LabCta } from "@/components/lab/chrome";
import { ToolPage } from "@/components/tool-page";
import { TOOLS_BY_SLUG, allTools } from "@/content/tools";
import { CATALOG } from "@/engine/catalog";
import { LAB, labPath } from "@/lib/brand";
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
    alternates: { canonical: `/thymelab/seo/checks/${tool.slug}` },
  };
}

export default async function QuickCheck({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = TOOLS_BY_SLUG.get(slug);
  if (!tool) notFound();
  const checks = tool.checks.map((code) => CATALOG[code]).filter(Boolean);

  return (
    <div className="tone-seo lab-check">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: LAB, path: "/thymelab" },
              { name: "Quick checks", path: "/thymelab/seo/checks" },
              { name: tool.name, path: `/thymelab/seo/checks/${tool.slug}` },
            ]),
            faqNode(tool.faq),
          ),
        }}
      />
      <section className="lab-section" style={{ paddingBottom: "0.5rem" }}>
        <span className="lab-eyebrow">Quick check</span>
        <h1 className="lab-title" style={{ fontSize: "clamp(2rem, 5vw, 3.4rem)" }}>{tool.name}</h1>
        <p className="lab-lede">{tool.blurb}</p>
      </section>

      {/* The interactive part. The explanation around it is server-rendered,
          so a crawler that runs no JavaScript still reads the page. */}
      <div className="lab-section tight"><ToolPage tool={tool} /></div>

      <section className="lab-section">
        <span className="lab-eyebrow">The detail</span>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>What this is actually checking</summary>
            <div className="acc-body">
              <p>{tool.description}</p>
              {tool.explains.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </details>
          {checks.length ? (
            <details className="acc">
              <summary>The {checks.length} check{checks.length === 1 ? "" : "s"} behind it</summary>
              <div className="acc-body">
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
        <p style={{ marginTop: "1.2rem" }}><Link href={labPath("/seo/checks")}>Every quick check &rarr;</Link></p>
      </section>

      <LabCta title="Or check everything at once." body={`${LAB} SEO reads the whole site and writes every fix.`} primary={{ href: labPath("/seo/audit"), label: "Check my site" }} />
    </div>
  );
}
