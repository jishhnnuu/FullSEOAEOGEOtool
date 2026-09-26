import Link from "next/link";

import { EXCLUDED_FOR, PLANS, PLAN_ORDER, priceLabel } from "@/lib/plans";
import { LabCta } from "@/components/lab/chrome";
import { LAB, labPath } from "@/lib/brand";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Thymelab pricing",
  description:
    "Thymelab is free to start. Paid plans raise the page limit, keep your history, re-run checks weekly and publish fixes to your website. Per site, per month, cancel anytime.",
  alternates: { canonical: "/thymelab/pricing" },
};

/**
 * The tool plans, read from the single plan definition the server enforces.
 * The agency's services are priced on the agency's own pricing page and never
 * appear here: two products, two price lists.
 */
const CAPABILITY_LABEL: Record<string, string> = {
  scheduling: "weekly re-runs",
  publishing: "fixes pushed live",
  answerVisibility: "AI answer tracking",
  linkProgramme: "link outreach",
  local: "local",
  contentDesk: "content tools",
  socialDesk: "social tools",
  paidDesk: "ads tools",
  whiteLabel: "your own branding",
};

const CTA: Record<string, { href: string; label: string }> = {
  free: { href: labPath("/seo/audit"), label: "Start free" },
  starter: { href: labPath("/seo/audit"), label: "Try it free first" },
  growth: { href: labPath("/seo/audit"), label: "Try it free first" },
  scale: { href: "/book", label: "Talk to us" },
};

const FAQ = [
  { q: "Is there a contract?", a: "No. Monthly, per site, cancel whenever. Everything you made stays yours and exports as a file." },
  { q: "What counts as a site?", a: "One domain. Separate brands are separate sites." },
  { q: "What about AI writing costs?", a: "If you want drafts written by a model, you add your own key and the provider bills you directly. Everything else works without one." },
  { q: "Can someone do it for me instead?", a: "Yes, that's our agency. It's priced separately, with a specialist doing the work." },
];

export default function LabPricing() {
  return (
    <div className="tone-seo">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }} />
      <section className="lab-section" style={{ paddingBottom: "1.5rem" }}>
        <span className="lab-eyebrow">{LAB} pricing</span>
        <h1 className="lab-title">Free to start. <span className="glow">Fair</span> after that.</h1>
        <p className="lab-lede">Every instrument works free. Pay when you want bigger checks, history and fixes published for you.</p>
      </section>

      <section className="lab-section tight">
        <div className="price-grid fresh-prices">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const excludes = EXCLUDED_FOR[id];
            const cta = CTA[id];
            return (
              <div className={`price${id === "growth" ? " featured" : ""}`} key={id}>
                {id === "growth" ? <span className="price-flag">Most complete</span> : null}
                <div className="name">{plan.name}</div>
                <div className="who">{plan.blurb}</div>
                <div className="amount">{priceLabel(plan)}</div>
                <div className="per">{plan.per}</div>
                <Link href={cta.href} className={id === "free" ? "lab-btn" : "lab-btn ghost"} style={{ justifyContent: "center" }}>
                  {cta.label}
                </Link>
                <ul>{plan.features.map((item) => <li key={item}>{item}</li>)}</ul>
                {excludes.length > 0 ? (
                  <p className="not-incl">Not included: {excludes.map((c) => CAPABILITY_LABEL[c] ?? c).join(", ")}.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="lab-section">
        <span className="lab-eyebrow">Money questions</span>
        <div style={{ marginTop: "1.2rem" }}>
          {FAQ.map((item) => (
            <details className="acc" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body"><p>{item.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      <LabCta secondary={{ href: "/pricing", label: "Agency pricing" }} />
    </div>
  );
}
