import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
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

      <section className="section">
        <div className="eyebrow">Free tool</div>
        <h1 className="section-title">Your page, and the pages you lose to, counted the same way.</h1>
        <p className="section-lede">
          Put in your page and up to five you compete with. This fetches all of them, strips the navigation, and
          counts: sentence rhythm, hedging, marketing filler, concrete specifics, reading grade, and who the page
          talks about. Then it shows you the differences that are large enough to matter, with both numbers, so you
          can disagree with it.
        </p>
      </section>

      <section className="section section-tight">
        <VoiceTool />
      </section>

      <section className="section">
        <h2 className="section-title small-title">Counting, not judging</h2>
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
      </section>

      <section className="section section-alt">
        <h2 className="section-title small-title">What the content desk does with this</h2>
        <p>
          On its own, a voice fingerprint is trivia. Inside an account it is the input to a house style: the desk
          reads the business, writes one point of view, and then every brief, draft and edit gate holds to a measured
          tone rather than an adjective in a style guide. The same numbers the tool shows you here are the ones the
          third edit gate checks a draft against before anyone is asked to approve it.
        </p>
        <p>
          <Link href="/content">The content desk page</Link> has the rest, including the four things it refuses to
          do. <Link href="/inside">Looking inside a live account</Link> shows it running.
        </p>
      </section>

      <CtaBand
        title="Measuring the writing is the easy half"
        body="Fourteen specialists take it from a measured page to an argument, a brief, a draft and three edit gates, all against a point of view you approved once."
        primary={{ href: "/content", label: "See the content desk" }}
        secondary={{ href: "/inside", label: "Look inside a live account" }}
      />
    </MarketingChrome>
  );
}
