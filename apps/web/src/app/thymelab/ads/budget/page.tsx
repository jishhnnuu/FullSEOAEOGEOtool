import Link from "next/link";

import { AdBudgetTool } from "@/components/ad-budget-tool";
import { ToolBench } from "@/components/lab/tool-bench";
import { SMART_BIDDING_MONTHLY } from "@/engine/ads";

export const metadata = {
  title: "The ads lab: will this ad budget actually work?",
  description: `Automated bidding needs about ${SMART_BIDDING_MONTHLY} conversions a month per platform before its model fits. Check whether your budget clears that, and what to change if it doesn't. Free, in your browser.`,
  alternates: { canonical: "/thymelab/ads/budget" },
};

export default function BudgetBench() {
  return (
    <ToolBench
      tool="ads"
      path="ads"
      layout="console"
      title="The ads lab"
      lead="Three numbers in, a straight answer out. The maths an agency on commission rarely shows you."
      aside={
        <>
          <div className="wb-gaugecard">
            <span className="lab-mono wb-k">The learning floor</span>
            <div className="wb-floor" aria-hidden="true">
              <div className="line"><span>~{SMART_BIDDING_MONTHLY} a month</span></div>
              <div className="bar" style={{ left: "8%", height: "82%" }} />
              <div className="bar" style={{ left: "40%", height: "34%", animationDelay: "-0.8s" }} />
              <div className="bar" style={{ left: "72%", height: "22%", animationDelay: "-1.6s" }} />
            </div>
            <p className="lab-muted small" style={{ margin: 0 }}>
              One platform above the line learns. Three below it all guess. That&rsquo;s why splitting a budget thinly
              wastes it.
            </p>
          </div>
          <div className="lab-card">
            <span className="lab-mono wb-k">Lab rule</span>
            <p className="lab-muted small" style={{ margin: 0 }}>No forecast from guessed numbers. Once your own are measured, an honest range.</p>
          </div>
        </>
      }
      after={
        <div>
          <details className="acc">
            <summary>Why {SMART_BIDDING_MONTHLY} a month is the number</summary>
            <div className="acc-body">
              <p>
                Every major platform now bids for you, and a bidding model needs examples to learn from. Meta publishes
                fifty conversions per ad set per week as the point an ad set leaves learning; Google&rsquo;s automated
                bidding wants roughly thirty a month per campaign before it beats a sensible manual bid.
              </p>
              <p>
                The floor is per platform, not across the account. Split a budget across five networks and each stays
                below its floor, so all five struggle at once.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>Why the forecast refuses</summary>
            <div className="acc-body">
              <p>
                Leave the click cost and conversion rate blank and it won&rsquo;t project a result. A forecast built on two
                assumed numbers is a sales document. With both measured from your own account, it shows a range of plus or
                minus thirty per cent.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>Rather have your ads run for you?</summary>
            <div className="acc-body">
              <p>Our agency checks your tracking first, builds every campaign paused, and reports your real sales. <Link href="/paid">See the paid ads service</Link>.</p>
            </div>
          </details>
        </div>
      }
    >
      <AdBudgetTool />
    </ToolBench>
  );
}
