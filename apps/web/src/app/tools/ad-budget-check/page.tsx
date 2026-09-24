import Link from "next/link";

import { AdBudgetTool } from "@/components/ad-budget-tool";
import { CtaBand, MarketingChrome } from "@/components/marketing";
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

      <section className="section">
        <div className="eyebrow">Free tool</div>
        <h1 className="section-title">Will this budget actually buy what you want it to buy?</h1>
        <p className="section-lede">
          Type your monthly budget, what one customer is worth paying for, and how many platforms you were
          planning to run. This tells you whether the platforms&rsquo; own bidding can work at that volume, and
          if not, exactly what to change. It is the conversation an agency charging a percentage of your spend
          has no reason to start.
        </p>
      </section>

      <section className="section section-tight">
        <AdBudgetTool />
      </section>

      <section className="section">
        <h2 className="section-title small-title">Why {SMART_BIDDING_MONTHLY} a month is the number</h2>
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
      </section>

      <section className="section section-alt">
        <h2 className="section-title small-title">Why the forecast refuses</h2>
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
      </section>

      <CtaBand
        title="The arithmetic is the easy part"
        body="Twenty-six specialists take it from a viable budget to verified tracking, an offer, the creative at every size, a campaign built paused, and a report that shows your own numbers rather than the sum of what the platforms claim."
        primary={{ href: "/paid", label: "See the paid desk" }}
        secondary={{ href: "/inside", label: "Look inside a live account" }}
      />
    </MarketingChrome>
  );
}
