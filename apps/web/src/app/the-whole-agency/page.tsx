import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { MANAGERS } from "@/lib/org";
import { BOOK, SERVICES, serviceByKey, servicePrice } from "@/lib/services";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Full-service marketing",
  description:
    "Your website, SEO, content, social and paid ads, handled together by one specialist on your account and an AI team behind them. One plan, one fixed monthly fee.",
  alternates: { canonical: "/the-whole-agency" },
};

/*
 * Everything, handled: the answer for the founder who wants marketing to
 * stop being their job. Still not the front door. Most people start with one
 * service and add the rest once they trust us, so the service pages are the
 * doors and this is where they lead.
 */

export default function WholeAgencyPage() {
  const everything = serviceByKey("everything");
  const included = SERVICES.filter((s) => s.key !== "everything");
  const overlaps = MANAGERS.filter((m) => m.status === "live" && m.overlap);

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Full-service marketing", path: "/the-whole-agency" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Full service</div>
        <h1 className="hero-title">
          Your whole marketing, <span className="hl">handled.</span>
        </h1>
        <p className="hero-lede">
          Website, SEO, content, social and ads, run together by one specialist who knows your business, with an AI team
          doing the legwork behind them.
        </p>
        <div className="hero-actions">
          <Link href={`${BOOK.href}?service=everything`} className="big-button primary">{BOOK.label} &rarr;</Link>
          <Link href="/pricing" className="big-button">See pricing</Link>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">What&rsquo;s included.</h2>
        <div className="fresh-desks three" style={{ marginTop: "1.4rem" }}>
          {included.map((service) => (
            <Link key={service.key} href={service.path} className="fresh-desk" data-desk={service.colour}>
              <span className="fd-name">{service.label}</span>
              <span className="fd-line">{service.line}</span>
              <span className="fd-foot">
                <span className="fd-status">Included</span>
                <span className="fd-go">Look &rarr;</span>
              </span>
            </Link>
          ))}
          <div className="fresh-desk" data-desk="cmo">
            <span className="fd-name">Your specialist</span>
            <span className="fd-line">One specialist across all of it. One person to ask, one plan.</span>
            <span className="fd-foot">
              <span className="fd-status">Included</span>
            </span>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: "1rem" }}>
          Already have a website you&rsquo;re happy with? Then it&rsquo;s the other four, and we start by checking the site
          you have.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">Why together beats separately.</h2>
        <div className="steps3" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>One specialist knows it all</h3>
            <p>No passing messages between an SEO agency, an ads freelancer and a social person.</p>
          </div>
          <div>
            <h3>One voice</h3>
            <p>Your website, posts and ads sound like the same company. Because they are.</p>
          </div>
          <div>
            <h3>Research once</h3>
            <p>Every AI team works from the same research, so you don&rsquo;t pay for it four times.</p>
          </div>
        </div>
        {overlaps.length > 0 && (
          <details className="acc" style={{ marginTop: "1.8rem" }}>
            <summary>Where the AI teams overlap, and who decides</summary>
            <div className="acc-body">
              {overlaps.map((m) => (
                <p key={m.key}><strong>{m.name}.</strong> {m.overlap}</p>
              ))}
            </div>
          </details>
        )}
        <details className="acc">
          <summary>What you&rsquo;re signing up to</summary>
          <div className="acc-body">
            <ul>
              <li>{servicePrice(everything)}. One fixed monthly fee, never a percentage of your ad spend.</li>
              <li>Month to month. Add or drop a service whenever you like.</li>
              <li>Everything we build is yours: the website, the accounts, the content and every fix.</li>
            </ul>
          </div>
        </details>
      </section>

      <CtaBand
        title="Start with a call."
        body="Most people start with one service and add the rest once they trust us. That's the right order, and we'll tell you which one to start with."
      />
    </MarketingChrome>
  );
}
