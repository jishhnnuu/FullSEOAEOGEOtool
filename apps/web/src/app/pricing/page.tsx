import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS, deskPrice, managerFor } from "@/lib/desks";
import { EXCLUDED_FOR, PLANS, PLAN_ORDER, priceLabel } from "@/lib/plans";
import { managerByKey } from "@/lib/org";

export const metadata = {
  title: "Pricing",
  description:
    "Per site, per month, with the audit free forever. Priced against what an agency retainer costs, because that is what it replaces.",
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
const CARDS = PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  return {
    plan,
    featured: id === "growth",
    // What the *next* plan up adds, shown as the things this tier does not
    // include. Derived rather than written, so it cannot go stale.
    excludes: EXCLUDED_FOR[id],
    cta:
      id === "free"
        ? { href: "/app/new", label: "See what we would fix" }
        : id === "scale"
          ? { href: "/app/new", label: "Try it on one site first" }
          : { href: "/app/new", label: "See what we would fix first" },
  };
});

const CAPABILITY_LABEL: Record<string, string> = {
  scheduling: "Scheduled runs, with nobody watching",
  publishing: "Publishing to your CMS",
  answerVisibility: "AI answer visibility measurement",
  linkProgramme: "Link prospecting and outreach",
  local: "Local: profile, posts, review replies",
  // Derived, not typed. A hand-written headcount here would drift from the
  // roster the moment a desk gained an agent, which is the same bug that once
  // had the firm page reporting 81 of 80.
  contentDesk: `The content desk, ${managerByKey("content")?.team.length ?? 0} specialists`,
  socialDesk: `The social desk, ${managerByKey("social")?.team.length ?? 0} specialists`,
  paidDesk: `The paid desk, ${managerByKey("paid")?.team.length ?? 0} specialists`,
  whiteLabel: "Client-facing reports under your brand",
};

const COMPARISON = [
  ["A mid-market SEO agency retainer", "£2,500 to £15,000", "per month"],
  ["An enterprise SEO suite licence", "£350 to £8,000", "per month, and somebody still does the work"],
  ["A freelance SEO on two days a month", "£800 to £2,000", "per month"],
  [`${PLANS.growth.name}, this platform`, priceLabel(PLANS.growth), PLANS.growth.per],
];

export default function PricingPage() {
  return (
    <MarketingChrome>
      <section className="section">
        <div className="eyebrow">Pricing</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          The audit is free. Always.
        </h1>
        <p className="section-lede">
          A deterministic crawl costs nothing to run: no model call, no data vendor, no per-seat licence behind
          it. Charging for it would be charging for nothing. What you pay for is the work that follows: the
          scheduling, the publishing, the content, the outreach and the record of what changed.
        </p>
      </section>

      {/*
        * Which desk each plan opens.
        *
        * The desks are what the work is; the plans are what you pay. Keeping
        * those separate is what stops a service page inventing a price of its
        * own, which is exactly the pricing-grid dishonesty this codebase
        * refuses everywhere else.
        */}
      <section className="section section-tight">
        <h2 className="section-title small-title">Which desks each plan opens</h2>
        <div className="desk-tiles" style={{ marginTop: "0.9rem" }}>
          {DESKS.map((desk) => {
            const manager = managerFor(desk);
            const open = manager.status === "live";
            return (
              <Link key={desk.key} href={desk.path} className={open ? "desk-tile" : "desk-tile soon"}>
                <span className="desk-name">{desk.label}</span>
                <span className="desk-count">
                  {open ? `${manager.team.length} specialists` : `Opens ${manager.opens}`}
                </span>
                <span className="desk-line">{desk.headline}</span>
                <span className="desk-price">{deskPrice(desk)}</span>
              </Link>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: "0.9rem", maxWidth: "72ch" }}>
          A desk is the work. A plan is the price. The two desks that are built open on the plans below, and the two
          that are not say so with the quarter they open rather than appearing in a grid as if they were available.{" "}
          <Link href="/the-whole-agency">Every desk on one plan</Link>.
        </p>
      </section>

      <section className="section section-tight">
        <div className="price-grid">
          {CARDS.map(({ plan, featured, excludes, cta }) => (
            <div className={`price${featured ? " featured" : ""}`} key={plan.id}>
              {featured && (
                <span className="badge badge-accent" style={{ marginBottom: "0.7rem", alignSelf: "flex-start" }}>
                  Replaces the retainer
                </span>
              )}
              <div className="name">{plan.name}</div>
              <div className="who">{plan.blurb}</div>
              <div className="amount">{priceLabel(plan)}</div>
              <div className="per">{plan.per}</div>
              <ul>
                {plan.features.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {excludes.map((item) => (
                  <li className="off" key={item}>{CAPABILITY_LABEL[item] ?? item}</li>
                ))}
              </ul>
              <Link href={cta.href} className={`button ${featured ? "primary" : ""}`}>
                {cta.label}
              </Link>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: "1.2rem", maxWidth: "70ch" }}>
          Model spend for drafting is separate and it is yours: you add your own provider key, the calls go
          straight from your browser through to your provider, and the bill arrives from them. The platform holds
          no model account, which is also why it keeps working if ours goes away.
        </p>
      </section>

      <section className="section section-alt">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">For context</div>
          <h2 className="section-title">What the same work costs elsewhere.</h2>
          <div className="table-scroll">
            <table className="compare-table">
              <thead><tr><th>Option</th><th className="num">Cost</th><th></th></tr></thead>
              <tbody>
                {COMPARISON.map(([what, cost, note]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    <td className="num"><strong>{cost}</strong></td>
                    <td className="muted small">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: "1rem", maxWidth: "70ch" }}>
            Every audit shows an estimate of the agency hours the same output would have been billed as, derived
            from the effort weighting on the findings it actually produced rather than picked to look good.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">Questions</div>
        <h2 className="section-title">About the money.</h2>
        <div style={{ marginTop: "1.4rem" }}>
          <div className="faq-item">
            <h3>Is there a contract?</h3>
            <p>Monthly. Stop whenever. Everything the platform produced for you exports as JSON and stays yours.</p>
          </div>
          <div className="faq-item">
            <h3>What counts as a site?</h3>
            <p>One domain. Subdomains you want crawled together count as one; separate brands are separate sites.</p>
          </div>
          <div className="faq-item">
            <h3>What if I want to run it myself?</h3>
            <p>
              Then run it yourself. The whole platform is open source and self-hostable: the API, the mission
              worker, the database and this dashboard. Paying us is for convenience, not access.
            </p>
          </div>
          <div className="faq-item">
            <h3>Do you mark up model costs?</h3>
            <p>
              There is nothing to mark up. Drafting uses your key and your account with the provider you choose.
              We never see the bill.
            </p>
          </div>
          <div className="faq-item">
            <h3>Can I start on the free plan and stay there?</h3>
            <p>
              Yes, and plenty of people should. If you have a ten page site and time to paste changes in yourself,
              the free plan does the thinking and you do the clicking.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        title="Start on the free plan"
        body="Run the audit, read the findings, take the fixes. Decide about the rest afterwards."
      />
    </MarketingChrome>
  );
}
