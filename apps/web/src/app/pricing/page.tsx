import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { LAB, LAB_PATH, labPath } from "@/lib/brand";
import { BOOK, SERVICES, servicePrice } from "@/lib/services";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Pricing",
  description:
    "Pay for the services you pick, each AI-powered and overseen by a specialist, at a fraction of a traditional agency. Or use the tools yourself in Thymelab, free to start.",
  alternates: { canonical: "/pricing" },
};

/**
 * The agency's prices only.
 *
 * The services (a specialist plus the AI team) come from `services.ts`, where
 * a price that has not been set says it is quoted on the call rather than
 * showing a made-up number. The tool plans used to sit underneath in a second
 * grid, which made the agency read like a software company with a services
 * add-on. They now live on the lab's own pricing page, and this page points
 * there once.
 */
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
    a: `Yes. The tools our team works with are in ${LAB}, our do-it-yourself lab, with their own plans. Start free, and book a specialist whenever you want one.`,
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

      <section className="section">
        <div className="lab-band">
          <div>
            <span className="lab-band-tag">{LAB}</span>
            <h2>Rather do it yourself?</h2>
            <p>
              The tools our team works with have their own plans in {LAB}, our do-it-yourself lab. Free to start, no
              specialist included, and you can book one any time.
            </p>
          </div>
          <div className="hero-actions">
            <Link href={labPath("pricing")} className="big-button">{LAB} pricing &rarr;</Link>
            <Link href={LAB_PATH} className="fresh-btn ghost lab-ghost">Look around the lab</Link>
          </div>
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
