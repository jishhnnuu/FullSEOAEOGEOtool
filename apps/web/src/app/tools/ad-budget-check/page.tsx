import Link from "next/link";

import { AdBudgetTool } from "@/components/ad-budget-tool";
import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Sprig } from "@/components/sprig";
import { SMART_BIDDING_MONTHLY } from "@/engine/ads";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Will this ad budget actually work",
  description:
    "Automated bidding needs about thirty conversions a month per platform before its model fits. Check whether your budget clears that, and what to change if it does not. No signup, runs in your browser.",
  alternates: { canonical: "/tools/ad-budget-check" },
};

/*
 * The one thing an agency will not tell you, on a public URL.
 *
 * Nobody whose fee is a percentage of a budget has ever talked a client out
 * of spreading it across five platforms. The arithmetic that says not to is
 * simple, public, and almost never shown, so showing it is worth more than
 * another page about our process.
 */

export default function AdBudgetCheckPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Free tools", path: "/tools" },
              { name: "Ad budget check", path: "/tools/ad-budget-check" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero seat-room" style={{ paddingBottom: "1.5rem" }}>
        <h1 className="hero-title">Will your ad <span data-sprig-seat="">budget</span> <span className="hl">actually</span> work?</h1>
        <p className="hero-lede">Three numbers in, a straight answer out. The maths an agency on commission never shows you.</p>
        <p className="hero-status"><span className="dot" aria-hidden="true" /><span>Free tool &middot; no signup</span></p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <AdBudgetTool />
      </section>

      <section className="section section-alt">
        <h2 className="section-title">The nerdy bit.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>Why {SMART_BIDDING_MONTHLY} a month is the number</summary>
            <div className="acc-body">
              <p>
                Every major platform now bids for you. Target cost per acquisition, maximise conversions, Advantage+,
                all of it is a model that predicts who will convert, and a model needs examples to fit. Meta publishes
                fifty conversions per ad set per week as the point an ad set leaves its learning phase. Google&rsquo;s
                smart bidding is looser but wants roughly thirty a month per campaign before it beats a sensible manual
                bid.
              </p>
              <p>
                Below that the platform is guessing with confidence. The campaign underperforms for reasons that have
                nothing to do with the creative or the targeting, and the postmortem blames the creative, which gets
                replaced, which resets the learning, which makes it worse.
              </p>
              <p>
                The floor is <strong>per platform</strong>, not across the account. That is why splitting a budget
                across five networks is the single most common way a reasonable budget produces nothing: each network
                gets a fifth, each stays below its floor, and all five fail at once.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>Why the forecast refuses</summary>
            <div className="acc-body">
              <p>
                Leave the click cost and conversion rate blank and this will not project a result. That is deliberate.
                A forecast built on two assumed numbers is a sales document, and multiplying two guesses produces a
                confident figure with no information in it.
              </p>
              <p>
                Once both are measured from your own account, the honest forecast is a range of plus or minus thirty
                per cent, which is what this shows. Until then the correct answer is that the first two weeks of spend
                are the measurement, and anybody giving you a number before that is selling.
              </p>
              <p>
                The same rule runs through the whole desk. <Link href="/paid">The paid page</Link> lists what it
                refuses to do, including refusing to spend anything at all on an account whose conversions cannot be
                counted.
              </p>
            </div>
          </details>
        </div>
      </section>



      <CtaBand
        title="The maths is the easy bit."
        body="Your person checks your tracking, and our AI team builds your ads paused and reports your real numbers."
        secondary={{ href: "/paid", label: "How our paid ads work" }}
      />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="paid" />
    </MarketingChrome>
  );
}
