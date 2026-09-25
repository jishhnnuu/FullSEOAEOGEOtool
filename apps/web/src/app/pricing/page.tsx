import Link from "next/link";
import { Fragment } from "react";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS, deskPrice, managerFor } from "@/lib/desks";
import { EXCLUDED_FOR, PLANS, PLAN_ORDER, priceLabel } from "@/lib/plans";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Pricing",
  description:
    "The audit is free forever. Plans from a fraction of an agency retainer, per site, per month, cancel anytime.",
  alternates: { canonical: "/pricing" },
};

/**
 * The plans, derived from the single definition in `lib/plans.ts`.
 *
 * This page used to hold its own array. That is the arrangement that produces
 * a pricing grid ticking a capability the product gates somewhere else, which
 * is the most common dishonesty in this category and the one thing our own
 * comparison pages criticise competitors for. Now there is exactly one
 * definition, the server enforces it, and this page reads it.
 */
const CTA: Record<string, { href: string; label: string }> = {
  free: { href: "/app/new", label: "Start free" },
  starter: { href: "/app/new", label: "Audit first, then decide" },
  growth: { href: "/app/new", label: "Audit first, then decide" },
  scale: { href: "/app/new", label: "Try it on one site first" },
};

const CAPABILITY_LABEL: Record<string, string> = {
  scheduling: "weekly check-ups",
  publishing: "fixes pushed live",
  answerVisibility: "AI answer tracking",
  linkProgramme: "link outreach",
  local: "local",
  contentDesk: "content desk",
  socialDesk: "social desk",
  paidDesk: "paid desk",
  whiteLabel: "your own branding",
};

const FAQ = [
  { q: "Is there a contract?", a: "No. Monthly, stop whenever. Everything we made for you stays yours and exports as a file." },
  { q: "What counts as a site?", a: "One domain. Subdomains you want crawled together count as one. Separate brands are separate sites." },
  {
    q: "Why is the audit free?",
    a: "Because it costs us almost nothing to run. No AI call, no data vendor behind it. Charging for it would be charging for nothing. You pay for the work that comes after.",
  },
  {
    q: "What about AI writing costs?",
    a: "If you want drafts written by a model, you add your own key and the provider bills you directly. We never see the bill, so there's nothing to mark up. Everything else works without a key.",
  },
  { q: "Can I just stay on Free?", a: "Yes, and plenty of people should. Small site, a bit of time to paste changes in? Free does the thinking, you do the clicking." },
  { q: "Can I run it myself?", a: "Yes. It can be self-hosted: the API, the worker, the database and this dashboard. Paying us is for convenience." },
];

const ELSEWHERE = [
  ["An SEO agency retainer: £2,500 to £15,000 a month", "The whole team, not one account manager"],
  ["An enterprise SEO suite: £350 to £8,000 a month, and you still do the work", "We do the work. You click yes."],
  ["A freelancer, two days a month: £800 to £2,000 a month", "Checking in every week, not twice a month"],
];

export default function PricingPage() {
  return (
    <MarketingChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }} />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Pricing</div>
        <h1 className="hero-title">
          Agency results. <span className="hl">Not</span> agency prices.
        </h1>
        <p className="hero-lede">The audit is free forever. Pay only when you want us to do the work.</p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <div className="price-grid fresh-prices">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const featured = id === "growth";
            const excludes = EXCLUDED_FOR[id];
            const cta = CTA[id];
            return (
              <div className={`price${featured ? " featured" : ""}`} key={plan.id}>
                {featured && <span className="price-flag">Most popular</span>}
                <div className="name">{plan.name}</div>
                <div className="who">{plan.blurb}</div>
                <div className="amount">{priceLabel(plan)}</div>
                <div className="per">{plan.per}</div>
                <Link href={cta.href} className={featured || id === "free" ? "big-button primary" : "big-button"}>
                  {cta.label}
                </Link>
                <ul>
                  {plan.features.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {excludes.length > 0 && (
                  <p className="not-incl">Not included: {excludes.map((c) => CAPABILITY_LABEL[c] ?? c).join(", ")}.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Which plan opens which desk.</h2>
        <div className="fresh-desks" style={{ marginTop: "1.4rem" }}>
          {DESKS.map((desk) => (
            <Link key={desk.key} href={desk.path} className="fresh-desk" data-desk={desk.key}>
              <span className="fd-name">{desk.label}</span>
              <span className="fd-line">
                {desk.requiresPlan ? `From ${deskPrice(desk)} a month on ${PLANS[desk.requiresPlan].name}` : deskPrice(desk)}
              </span>
              <span className="fd-foot">
                <span className="fd-status">{desk.ready.label}</span>
                <span className="fd-go">Look &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">For comparison.</h2>
        <div className="vgrid" style={{ marginTop: "1.4rem" }}>
          <div className="vg-head">Elsewhere</div>
          <div className="vg-head us">{PLANS.growth.name}: {priceLabel(PLANS.growth)} a month</div>
          {ELSEWHERE.map(([them, us]) => (
            <Fragment key={them}>
              <div className="vg-them">{them}</div>
              <div className="vg-us">{us}</div>
            </Fragment>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Money questions.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          {FAQ.map((item) => (
            <details className="acc" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body"><p>{item.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      <CtaBand title="Start with the free bit." body="Run the audit. See the fixes. Decide about the rest afterwards." />
    </MarketingChrome>
  );
}
