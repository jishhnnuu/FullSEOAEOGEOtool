import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { EXCLUDED_FOR, PLANS, PLAN_ORDER, priceLabel } from "@/lib/plans";
import { BOOK, SERVICES, servicePrice } from "@/lib/services";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Pricing",
  description:
    "Pay for the services you pick, each AI-powered and overseen by a specialist, at a fraction of a traditional agency. Or use the same tools yourself, free to start.",
  alternates: { canonical: "/pricing" },
};

/**
 * Two kinds of price, kept apart on purpose.
 *
 * The services (a person plus the AI team) are the business, and their prices
 * come from `services.ts`, where a price that has not been set says it is
 * quoted on the call rather than showing a made-up number. The tool plans come
 * from `plans.ts`, the single definition the server enforces, so the grid can
 * never tick something the product gates elsewhere.
 */
const CTA: Record<string, { href: string; label: string }> = {
  free: { href: "/app/new", label: "Start free" },
  starter: { href: "/app/new", label: "Check my site first" },
  growth: { href: "/app/new", label: "Check my site first" },
  scale: { href: BOOK.href, label: "Talk to us" },
};

const CAPABILITY_LABEL: Record<string, string> = {
  scheduling: "weekly check-ups",
  publishing: "fixes pushed live",
  answerVisibility: "AI answer tracking",
  linkProgramme: "link outreach",
  local: "local",
  contentDesk: "content tools",
  socialDesk: "social tools",
  paidDesk: "ads tools",
  whiteLabel: "your own branding",
};

const FAQ = [
  {
    q: "Why aren't all the prices on the page?",
    a: "Because the right price depends on your business: how many pages, how many ad platforms, how much content. We'd rather quote a fixed monthly fee after thirty minutes than publish a starting price you'd never actually pay. The quote is in writing, and it's always well under the agency figure beside each service.",
  },
  {
    q: "Why do you cost less than an agency?",
    a: "Most of an agency's fee pays for hours of legwork: research, audits, first drafts, reports. Our AI team does that. You pay for the specialist who looks after you and for the results.",
  },
  {
    q: "What does my specialist actually do?",
    a: "They run your first call, set up your accounts with you, direct the AI team, check the work before it reaches you, and walk you through the results. They're who you contact when you need a human.",
  },
  { q: "Is there a contract?", a: "No. Month to month. Add or drop a service whenever you like, and everything we made for you stays yours." },
  {
    q: "Is ad spend included?",
    a: "No. What you spend on ads goes straight to Google, Meta and the rest, from your own account. Our fee is fixed and never a percentage of your spend.",
  },
  {
    q: "Can I just use the tools myself?",
    a: "Yes. The tool plans below are the same software our team uses. Start free, and book a specialist whenever you want one.",
  },
];

export default function PricingPage() {
  return (
    <MarketingChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }} />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Pricing</div>
        <h1 className="hero-title">
          Agency work. <span className="hl">Not</span> agency prices.
        </h1>
        <p className="hero-lede">
          Pick one service or all of them. Each is overseen by a specialist, and costs a fraction of an agency because
          AI does the legwork.
        </p>
        <div className="hero-actions">
          <Link href={BOOK.href} className="big-button primary">Get a quote on a free call &rarr;</Link>
        </div>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <h2 className="section-title">Our services.</h2>
        <div className="vgrid services-grid" style={{ marginTop: "1.2rem" }}>
          <div className="vg-head">Service</div>
          <div className="vg-head">A traditional agency</div>
          <div className="vg-head us">Us: AI-powered, specialist-led</div>
          {SERVICES.map((service) => (
            <ServiceRow key={service.key} service={service} />
          ))}
        </div>
        <p className="small muted" style={{ marginTop: "0.9rem" }}>
          Agency figures are typical UK ranges for the same scope, with the basis on each service page. Ad spend is
          never included and never marked up.
        </p>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Rather do it yourself?</h2>
        <p className="section-lede">
          The same tools our team uses, on your own. No specialist included, but you can book one any time.
        </p>
        <div className="price-grid fresh-prices" style={{ marginTop: "1.4rem" }}>
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const excludes = EXCLUDED_FOR[id];
            const cta = CTA[id];
            return (
              <div className="price" key={plan.id}>
                <div className="name">{plan.name}</div>
                <div className="who">{plan.blurb}</div>
                <div className="amount">{priceLabel(plan)}</div>
                <div className="per">{plan.per}</div>
                <Link href={cta.href} className={id === "free" ? "big-button primary" : "big-button"}>
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

      <section className="section">
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

      <CtaBand title="Get your quote." body="Thirty minutes, a fixed monthly price in writing, and a plan you keep either way." />
    </MarketingChrome>
  );
}

function ServiceRow({ service }: { service: (typeof SERVICES)[number] }) {
  return (
    <>
      <div className="vg-name">
        <Link href={service.path}><strong>{service.label}</strong></Link>
        <span className="small muted">{service.line}</span>
      </div>
      <div className="vg-them">{service.agency}</div>
      <div className="vg-us">{servicePrice(service)}</div>
    </>
  );
}
