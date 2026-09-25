import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Sprig } from "@/components/sprig";
import { allTools } from "@/content/tools";
import { CATALOG_SIZE } from "@/engine/catalog";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Free SEO, content and social tools",
  description:
    `Free tools that run the real engine on your real inputs: a competitor social teardown, an ad budget check, a voice comparison and slices of the ${CATALOG_SIZE}-check audit. No signup.`,
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
    path: "/app/new",
    name: "Audit my site",
    blurb: "Everything that's broken, with the fixes already written.",
    emoji: "\u{1F50D}",
    color: "var(--desk-search)",
  },
  {
    path: "/tools/social-teardown",
    name: "Scout a competitor",
    blurb: "Which of their posts actually worked, and the hook they share.",
    emoji: "\u{1F575}",
    color: "var(--desk-social)",
  },
  {
    path: "/tools/ad-budget-check",
    name: "Check my ad budget",
    blurb: "Is it enough to work? The honest maths, in ten seconds.",
    emoji: "\u{1F4B8}",
    color: "var(--desk-paid)",
  },
  {
    path: "/tools/voice-check",
    name: "Test my writing",
    blurb: "Your page against your rivals. Do you sound like you?",
    emoji: "\u270D",
    color: "var(--desk-content)",
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
      <section className="section fresh-hero seat-room" style={{ paddingBottom: "1.5rem" }}>
        <h1 className="hero-title">
          Free <span data-sprig-seat="">tools</span> that <span className="hl">actually</span> do something.
        </h1>
        <p className="hero-lede">Real engine, your real inputs, answers in seconds. Pick one.</p>
        <p className="hero-status"><span className="dot" aria-hidden="true" /><span>Free &middot; no signup &middot; nothing stored</span></p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <div className="tool-cards">
          {DESK_TOOLS.map((tool) => (
            <Link key={tool.path} href={tool.path} className="tool-card">
              <span className="tc-emoji" style={{ background: tool.color }} aria-hidden="true">{tool.emoji}</span>
              <h2 style={{ fontSize: "1.2rem", margin: "0.3rem 0 0.2rem" }}>{tool.name}</h2>
              <p>{tool.blurb}</p>
              <span className="tc-go">Start &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Got one specific question?</h2>
        <p className="section-lede">Each of these answers one thing about one page, using the same checks as the full audit.</p>
        <div className="mini-tools">
          {tools.map((tool) => (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="mini-tool">
              <strong>{tool.name}</strong>
              <span>{tool.blurb}</span>
            </Link>
          ))}
        </div>
        <details className="acc" style={{ marginTop: "1.8rem" }}>
          <summary>Why can these be free?</summary>
          <div className="acc-body">
            <p>
              Because the audit uses no AI model and no data vendor, a run costs us almost nothing. Tools charging for
              the same answer are paying for a model call or a data credit per site. And since these run the same
              engine as the paid audit, a free tool and the paid product can never disagree about what&rsquo;s wrong.
            </p>
          </div>
        </details>
      </section>

      <CtaBand
        title={`Or run all ${CATALOG_SIZE} checks at once.`}
        body="The full audit reads your whole site and writes every fix. Same price: nothing."
      />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="rotate" />
    </MarketingChrome>
  );
}
