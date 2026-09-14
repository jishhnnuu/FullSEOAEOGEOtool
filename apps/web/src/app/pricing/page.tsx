import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";

export const metadata = {
  title: "Pricing",
  description:
    "Per site, per month, with the audit free forever. Priced against what an agency retainer costs, because that is what it replaces.",
};

/**
 * The plans.
 *
 * Kept as one array at the top of the file on purpose: pricing changes more
 * often than anything else on a marketing site, and it should be one edit.
 */
const PLANS = [
  {
    name: "Free",
    amount: "£0",
    per: "forever, one site",
    who: "Anyone who wants to see what is actually wrong before deciding anything.",
    cta: { href: "/app/new", label: "Run an audit" },
    featured: false,
    includes: [
      "The full check catalogue on every run",
      "Up to 40 pages crawled per run",
      "Every fix that can be generated, generated",
      "AI crawler access and extractability check",
      "Content gaps and three briefs",
      "Export everything as JSON",
    ],
    excludes: ["Scheduled runs", "Publishing to your CMS", "Run history and change reporting"],
  },
  {
    name: "Starter",
    amount: "£79",
    per: "per site, per month",
    who: "A single site that wants the work done rather than described.",
    cta: { href: "/app/new", label: "Start with a free audit" },
    featured: false,
    includes: [
      "Everything in Free",
      "Up to 250 pages crawled per run",
      "Weekly scheduled runs",
      "Full run history and change reporting",
      "Search Console and analytics connected",
      "Approval queue with autonomy levels",
      "Publishing to WordPress, Shopify, Webflow or a webhook",
    ],
    excludes: ["Local cycle", "Outreach sending"],
  },
  {
    name: "Growth",
    amount: "£249",
    per: "per site, per month",
    who: "The plan that actually replaces a retainer. Content, local and links included.",
    cta: { href: "/app/new", label: "Start with a free audit" },
    featured: true,
    includes: [
      "Everything in Starter",
      "Up to 2,000 pages crawled per run",
      "Content production on your cadence, with the quality gates",
      "Local cycle: profile, posts, review replies, citations",
      "Link prospecting and outreach from your own domain",
      "AI answer tracking across the twelve engines",
      "Monthly narrative report with the trace behind every claim",
    ],
    excludes: [],
  },
  {
    name: "Agency",
    amount: "Talk to us",
    per: "multi-site and white label",
    who: "Agencies running this for their own clients, and companies with a portfolio of sites.",
    cta: { href: "/app/new", label: "Try it on one site first" },
    featured: false,
    includes: [
      "Everything in Growth, across every site",
      "Unlimited sites and seats",
      "Client-facing reports under your own brand",
      "Self-hosted deployment, or we run it",
      "Priority on connector work you need",
    ],
    excludes: [],
  },
];

const COMPARISON = [
  ["A mid-market SEO agency retainer", "£2,500 to £15,000", "per month"],
  ["An enterprise SEO suite licence", "£350 to £8,000", "per month, and somebody still does the work"],
  ["A freelance SEO on two days a month", "£800 to £2,000", "per month"],
  ["SEO OS, Growth", "£249", "per site, per month"],
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

      <section className="section section-tight">
        <div className="price-grid">
          {PLANS.map((plan) => (
            <div className={`price${plan.featured ? " featured" : ""}`} key={plan.name}>
              {plan.featured && (
                <span className="badge badge-accent" style={{ marginBottom: "0.7rem", alignSelf: "flex-start" }}>
                  Replaces the retainer
                </span>
              )}
              <div className="name">{plan.name}</div>
              <div className="who">{plan.who}</div>
              <div className="amount">{plan.amount}</div>
              <div className="per">{plan.per}</div>
              <ul>
                {plan.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {plan.excludes.map((item) => (
                  <li className="off" key={item}>{item}</li>
                ))}
              </ul>
              <Link href={plan.cta.href} className={`button ${plan.featured ? "primary" : ""}`}>
                {plan.cta.label}
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
