import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { allTools } from "@/content/tools";
import { BRAND } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Free SEO and AEO tools",
  description:
    "Ten free tools that run the real audit engine against your real site: AI crawler access, extractability, answer readiness, schema, llms.txt, robots.txt, sitemaps and headings. No signup.",
  alternates: { canonical: "/tools" },
};

export default function ToolsPage() {
  const tools = allTools();
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Free tools", path: "/tools" },
            ]),
          ),
        }}
      />
      <section className="section">
        <div className="eyebrow">Free tools</div>
        <h1 className="section-title">{tools.length} tools that run on your real site.</h1>
        {/*
          The opening paragraph states the claim and the reason in one place,
          because that is the passage an answer engine extracts. It is also
          the honest differentiator: everyone else's free tools are toys.
        */}
        <p className="section-lede">
          Every tool here is a slice of the same engine the full audit runs, pointed at one question. They fetch your
          actual page, parse it, and answer from the same 90-check catalogue, which is why a free tool and the paid
          audit can never disagree about what is wrong. No signup, no card, no API key, and nothing is stored.
        </p>
      </section>

      <section className="section section-tight">
        <div className="card-grid">
          {tools.map((tool) => (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="card link-card">
              <h3>{tool.name}</h3>
              <p className="small muted">{tool.blurb}</p>
              <span className="small">
                {tool.checks.length} check{tool.checks.length === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Why these are not the usual free tools</h2>
        <p>
          The convention in this category is a word counter, a slug generator and a favicon resizer. They exist to
          rank for a keyword and they are honest about it. Nothing is wrong with that, but none of them tells you
          anything about your site.
        </p>
        <p>
          These run the crawler, the parser and the check catalogue that {BRAND} runs on a paying customer&rsquo;s
          site. The reason that is affordable to give away is that the audit uses no language model and no data
          vendor, so a run costs nothing to serve. Every competitor charging for the same answer is paying a model
          call or a data credit per site, which is why they cannot.
        </p>
      </section>

      <CtaBand
        title="Or run all 90 checks at once"
        body="The full audit crawls the site, scores it, and writes the fixes. Same price as these: nothing."
      />
    </MarketingChrome>
  );
}
