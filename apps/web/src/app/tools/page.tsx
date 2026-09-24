import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { allTools } from "@/content/tools";
import { BRAND } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Free SEO, content and social tools",
  description:
    "Free tools that run the real engine against your real inputs: a competitor social teardown, a voice comparison against your rivals, and ten slices of the 90-check audit. No signup.",
  alternates: { canonical: "/tools" },
};

/*
 * Two of these are not catalogue slices.
 *
 * The teardown and the voice check belong to the social and content desks and
 * take an input that is not your own address: a competitor's handle, or the
 * pages you lose to. They sit above the catalogue because they are the only
 * two on this site that let a stranger watch a desk other than search do its
 * work, and until they had URLs nobody could reach them at all.
 */
const DESK_TOOLS = [
  {
    path: "/tools/social-teardown",
    name: "Competitor social teardown",
    blurb:
      "A competitor's public posts, the ones that beat their own median, and the hook the winners share. Up to five accounts gives you share of voice.",
    desk: "Social desk",
  },
  {
    path: "/tools/voice-check",
    name: "Voice against your rivals",
    blurb:
      "Rhythm, hedging, filler, specifics and reading grade for your page and the pages you compete with, counted the same way. No model reads anything.",
    desk: "Content desk",
  },
];

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
        <h1 className="section-title">{tools.length + DESK_TOOLS.length} tools that run on your real inputs.</h1>
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
        <h2 className="section-title small-title">The two that take more than a URL</h2>
        <div className="card-grid">
          {DESK_TOOLS.map((tool) => (
            <Link key={tool.path} href={tool.path} className="card link-card">
              <h3>{tool.name}</h3>
              <p className="small muted">{tool.blurb}</p>
              <span className="small">{tool.desk}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Ten slices of the audit, one question each</h2>
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
