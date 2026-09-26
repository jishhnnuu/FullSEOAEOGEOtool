import { ToolLanding } from "@/components/lab/tool-landing";
import { SMART_BIDDING_MONTHLY } from "@/engine/ads";
import { LAB, labPath } from "@/lib/brand";

export const metadata = {
  title: `${LAB} Ads: will your ad budget actually work?`,
  description: `Automated bidding needs about ${SMART_BIDDING_MONTHLY} conversions a month per platform before it works. Check whether your budget clears that, and what to change if it doesn't. Free, in your browser.`,
  alternates: { canonical: "/thymelab/ads" },
};

export default function LabAds() {
  return (
    <ToolLanding
      tool="ads"
      eyebrow={`${LAB} Ads`}
      title="Know your ad budget works"
      glow="before you spend it."
      lede="Three numbers in, a straight answer out. See if your budget is big enough for each platform to learn, and where splitting it would waste it."
      primary={{ href: labPath("/ads/budget"), label: "Check my ad budget" }}
      does={[
        { title: "The learning floor", body: `Each platform needs about ${SMART_BIDDING_MONTHLY} conversions a month to bid well. We check yours clears it.` },
        { title: "Where to put the money", body: "Why one platform done properly usually beats five done thinly." },
        { title: "No made-up forecasts", body: "No guessed results until your own numbers exist. Then an honest range, not a promise." },
      ]}
      readout={[
        { label: "monthly budget .............", value: "£1,500" },
        { label: "platforms that can learn ...", value: "1 of 3", tone: "hi" },
        { label: "advice .....................", value: "start with one platform" },
        { label: "forecast ...................", value: "needs your own data first", tone: "dim" },
      ]}
      faq={[
        { q: "Why won't it forecast my results?", a: "A forecast built on guessed numbers is a sales document. Once your own click cost and conversion rate are measured, it shows an honest range." },
        { q: `Why ${SMART_BIDDING_MONTHLY} conversions?`, a: "That's roughly what the platforms' automated bidding needs each month to learn who buys. Below it, the platform is guessing with confidence." },
      ]}
    />
  );
}
