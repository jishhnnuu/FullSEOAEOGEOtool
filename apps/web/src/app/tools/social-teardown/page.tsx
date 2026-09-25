import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Sprig } from "@/components/sprig";
import { SocialTeardownTool } from "@/components/social-teardown-tool";
import { breadcrumbNode, graph } from "@/lib/schema";
import { PLATFORMS, readableForCompetitors } from "@/lib/social-platforms";

export const metadata = {
  title: "Competitor social teardown",
  description:
    "Read a competitor's public posts, find the ones that beat their own median, and name the hook the winners share. YouTube needs no key at all. No signup.",
  alternates: { canonical: "/tools/social-teardown" },
};

/*
 * The teardown, as a page a stranger can land on.
 *
 * It existed before this page did, three clicks inside a workspace that first
 * required creating a site, which meant the single most useful thing the
 * social desk does was invisible to anyone deciding whether to use us. A
 * capability nobody can reach is indistinguishable from a capability nobody
 * built.
 */

export default function SocialTeardownPage() {
  const readable = readableForCompetitors();
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Free tools", path: "/tools" },
              { name: "Competitor social teardown", path: "/tools/social-teardown" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero seat-room" style={{ paddingBottom: "1.5rem" }}>
        <h1 className="hero-title">Scout a <span data-sprig-seat="">competitor</span>. <span className="hl">Fair</span> and square.</h1>
        <p className="hero-lede">Type a handle. See which of their posts actually worked, and why. YouTube needs no key at all.</p>
        <p className="hero-status"><span className="dot" aria-hidden="true" /><span>Free tool &middot; no signup</span></p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <SocialTeardownTool />
      </section>

      <section className="section section-alt">
        <h2 className="section-title">The nerdy bit.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>Why there is no impressions column</summary>
            <div className="acc-body">
              <p>
                Because there is no impressions number to read. Impressions, reach, saves and profile visits are computed
                by the platform for the account owner and released only through that owner&rsquo;s own access token. No
                public endpoint on any network returns them for somebody else&rsquo;s account, so every competitor reach
                figure any tool has ever shown you was estimated from follower count and presented as measurement.
              </p>
              <p>
                What is public is the engagement: likes, comments, shares, and on some platforms views. The honest
                comparable built from that is the <strong>performance multiple</strong>, a post&rsquo;s engagement divided
                by the median of that same account. It answers the question you actually have, which is not &ldquo;how
                many people saw this&rdquo; but &ldquo;which of their posts worked, and what did those have in
                common&rdquo;.
              </p>
              <p>
                Of the {PLATFORMS.length} networks the desk knows about, {readable.length} permit a competitor
                teardown at all. <Link href="/social">The social desk page</Link> names each one and what it refuses,
                which is worth reading before anyone sells you a dashboard covering all ten.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>What happens to the credential you paste</summary>
            <div className="acc-body">
              <p>
                It goes into your browser&rsquo;s own storage and into the request that uses it, and nowhere else. The
                relay that calls the platform holds a fixed list of hosts it is allowed to reach, takes your key on the
                request and forgets it when the request ends. Nothing is written to a database, because on this page
                there is no account to write it to.
              </p>
              <p>
                That is the same rule the whole platform runs on: the drafting relays your own model key and never keeps
                it, and the audit needs no key at all. <Link href="/security">The security page</Link> has the detail.
              </p>
            </div>
          </details>
        </div>
      </section>



      <CtaBand
        title="A teardown is hour one. We do the rest."
        body="The social desk plans your calendar and drafts every post, ready for your yes."
        primary={{ href: "/social", label: "Meet the social desk" }}
        secondary={{ href: "/inside", label: "Peek inside a live account" }}
      />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="social" />
    </MarketingChrome>
  );
}
