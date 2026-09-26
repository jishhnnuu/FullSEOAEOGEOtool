import Link from "next/link";

import { ToolLanding } from "@/components/lab/tool-landing";
import { allTools } from "@/content/tools";
import { CATALOG_SIZE } from "@/engine/catalog";
import { labPath } from "@/lib/brand";

export const metadata = {
  title: "The SEO lab: check any website's SEO, free",
  description: `Run a full SEO check on any website: ${CATALOG_SIZE} checks across technical SEO, content, structured data and AI search, with every fixable problem's fix written out. Free, in your browser.`,
  alternates: { canonical: "/thymelab/seo" },
};

export default function LabSeo() {
  const quick = allTools().slice(0, 6);
  return (
    <ToolLanding
      tool="seo"
      eyebrow="Exp 01 / The SEO lab"
      title="See your website the way"
      glow="Google does."
      lede={`Paste any website. We read it the way search engines and AI assistants do, run ${CATALOG_SIZE} checks, and write the fix for every problem we can.`}
      primary={{ href: labPath("/seo/audit"), label: "Run the SEO lab" }}
      secondary={{ href: labPath("/seo/checks"), label: "Quick checks" }}
      does={[
        { title: "Reads every page", body: "Robots rules, sitemaps and your pages, the way a crawler sees them. Up to 40 pages free." },
        { title: "Finds what's wrong", body: "Technical problems, thin pages, broken structured data, and what stops AI assistants quoting you." },
        { title: "Writes the fixes", body: "New titles, descriptions, redirects and schema, written out so you can copy them in." },
      ]}
      readout={[
        { label: "pages read .................", value: "38 of 40", tone: "hi" },
        { label: "critical problems ..........", value: "2, fixes written" },
        { label: "AI crawlers allowed ........", value: "yes" },
        { label: "titles to rewrite ..........", value: "7, drafts ready" },
        { label: "real-visitor speed .........", value: "needs Search Console", tone: "dim" },
      ]}
      faq={[
        { q: "Is it really free?", a: "Yes. The full check runs on up to 40 pages with no signup. Paid plans raise the page limit, keep your history, re-run weekly and can publish fixes to your website." },
        { q: "Can I check a competitor's site?", a: "Yes. It reads only what's public, so it works on any website." },
        { q: "How complete is it?", a: "It's an overview from what anyone can see publicly, like the first look an agency takes. Connect Google Search Console and Analytics and it gets fuller: your searches, clicks and indexed pages." },
      ]}
    >
      <section className="lab-section">
        <span className="lab-eyebrow">Quick checks</span>
        <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>One question, one answer.</h2>
        <div className="lab-tools">
          {quick.map((tool) => (
            <Link key={tool.slug} href={labPath(`/seo/checks/${tool.slug}`)} className="lab-tool" style={{ minHeight: 0 }}>
              <span className="lt-code">Quick check</span>
              <h3 style={{ fontSize: "1.15rem" }}>{tool.name}</h3>
              <p>{tool.blurb}</p>
              <span className="lt-go">Run &rarr;</span>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: "1rem" }}>
          <Link href={labPath("/seo/checks")}>Every quick check &rarr;</Link>
        </p>
      </section>
    </ToolLanding>
  );
}
