import Link from "next/link";

import { LabCta } from "@/components/lab/chrome";
import { allTools } from "@/content/tools";
import { LAB, labPath } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Quick SEO checks",
  description:
    "Single-question SEO checks for any page: can AI crawlers read it, is the structured data valid, is the title right, and more. Each one is a slice of the full SEO lab, free and instant.",
  alternates: { canonical: "/thymelab/seo/checks" },
};

export default function QuickChecks() {
  return (
    <div className="tone-seo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: LAB, path: "/thymelab" },
              { name: "SEO", path: "/thymelab/seo" },
              { name: "Quick checks", path: "/thymelab/seo/checks" },
            ]),
          ),
        }}
      />
      <section className="lab-section" style={{ paddingBottom: "1rem" }}>
        <span className="lab-eyebrow">{LAB} SEO &middot; quick checks</span>
        <h1 className="lab-title">One question. <span className="glow">One answer.</span></h1>
        <p className="lab-lede">Each check is one slice of the full SEO check. Paste a page, get the answer in seconds.</p>
      </section>
      <section className="lab-section tight">
        <div className="lab-tools">
          {allTools().map((tool) => (
            <Link key={tool.slug} href={labPath(`/seo/checks/${tool.slug}`)} className="lab-tool" style={{ minHeight: 0 }}>
              <span className="lt-code">Quick check</span>
              <h3 style={{ fontSize: "1.15rem" }}>{tool.name}</h3>
              <p>{tool.blurb}</p>
              <span className="lt-go">Run &rarr;</span>
            </Link>
          ))}
        </div>
      </section>
      <LabCta title="Or check everything at once." body={`${LAB} SEO reads the whole site and writes every fix.`} primary={{ href: labPath("/seo/audit"), label: "Check my site" }} />
    </div>
  );
}
