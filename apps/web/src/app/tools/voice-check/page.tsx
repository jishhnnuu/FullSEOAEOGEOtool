import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Sprig } from "@/components/sprig";
import { VoiceTool } from "@/components/voice-tool";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Voice and readability against your rivals",
  description:
    "Measure a page's rhythm, hedging, marketing filler, specifics and reading grade, then compare it with the pages you compete with. Counting, not judgement. No model, no key, no signup.",
  alternates: { canonical: "/tools/voice-check" },
};

/*
 * The content desk's one measurement that needs nothing.
 *
 * Everything else the desk does works against an argument a client approved,
 * which means it needs an account. This does not: it reads pages, counts, and
 * compares. Putting it on a public URL is the difference between claiming the
 * desk measures tone and letting somebody watch it happen.
 */

export default function VoiceCheckPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Free tools", path: "/tools" },
              { name: "Voice check", path: "/tools/voice-check" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero seat-room" style={{ paddingBottom: "1.5rem" }}>
        <h1 className="hero-title">Do you <span data-sprig-seat="">sound</span> like <span className="hl">you?</span></h1>
        <p className="hero-lede">Your page against up to five rivals. Counted, not judged. No AI, no signup.</p>
        <p className="hero-status"><span className="dot" aria-hidden="true" /><span>Free tool &middot; no signup</span></p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <VoiceTool />
      </section>

      <section className="section section-alt">
        <h2 className="section-title">The nerdy bit.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>Counting, not judging</summary>
            <div className="acc-body">
              <p>
                No model reads these pages. Nothing here needs a key, and nothing here is an opinion dressed as a score.
                Every figure is a count you could reproduce by hand with enough patience: how many sentences, how long
                each one, how many of them hedge, how many numbers and names appear per hundred words, how often the page
                says &ldquo;we&rdquo; against how often it says &ldquo;you&rdquo;.
              </p>
              <p>
                It refuses in two situations, and both are on purpose. A page under 120 words has no rhythm to measure, so
                it is dropped and named. Fewer than three readable rivals is not a field, so no comparison is drawn and
                the page says so instead of quietly comparing you to one competitor and calling it the market.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>What our content team does with this</summary>
            <div className="acc-body">
              <p>
                On its own, a voice fingerprint is trivia. For a client it is the input to a house style: the AI team
                reads the business, writes one point of view, and then every brief, draft and edit gate holds to a measured
                tone rather than an adjective in a style guide. The same numbers the tool shows you here are the ones the
                third edit gate checks a draft against before anyone is asked to approve it.
              </p>
              <p>
                <Link href="/content">The content page</Link> has the rest, including the four things it refuses to
                do. <Link href="/inside">Looking inside a live account</Link> shows it running.
              </p>
            </div>
          </details>
        </div>
      </section>



      <CtaBand
        title="Measuring is the easy half."
        body="Our AI team turns this into briefs, drafts and edits in your voice, checked by your specialist."
        secondary={{ href: "/content", label: "How our content works" }}
      />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="content" />
    </MarketingChrome>
  );
}
