import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS, managerFor, WHOLE_AGENCY } from "@/lib/desks";
import { MANAGERS } from "@/lib/org";
import { PLANS, priceLabel } from "@/lib/plans";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "The whole agency",
  description:
    "Every desk on one plan. Search, content, social and paid share one research pass, one voice and one inbox, for one monthly price.",
  alternates: { canonical: "/the-whole-agency" },
};

/*
 * The upsell, and deliberately not the entry.
 *
 * People arrive wanting one thing and expand once they trust you. Making this
 * the front door asks a stranger to buy everything before they have bought
 * anything, which is why the service pages are the doors and this is where
 * they send somebody who has already decided.
 */

export default function WholeAgencyPage() {
  const plan = PLANS[WHOLE_AGENCY.plan];
  const overlaps = MANAGERS.filter((m) => m.status === "live" && m.overlap);

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "The whole agency", path: WHOLE_AGENCY.path },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Every desk, one plan</div>
        <h1 className="hero-title">
          Every desk. <span className="hl">One</span> price.
        </h1>
        <p className="hero-lede">
          {priceLabel(plan)} a month per site on {plan.name}. Search, content, social and paid, all talking to each
          other.
        </p>
        <div className="hero-actions">
          <Link href="/app/new" className="big-button primary">Start with a free audit &rarr;</Link>
          <Link href="/pricing" className="big-button">Compare plans</Link>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">What&rsquo;s in the box.</h2>
        <div className="fresh-desks" style={{ marginTop: "1.4rem" }}>
          {DESKS.map((desk) => (
            <Link key={desk.key} href={desk.path} className="fresh-desk" data-desk={desk.key}>
              <span className="fd-name">{desk.label}</span>
              <span className="fd-line">{desk.tagline}</span>
              <span className="fd-foot">
                <span className="fd-status">{desk.ready.label}</span>
                <span className="fd-go">Included</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Why together beats separately.</h2>
        <div className="steps3" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>Research once</h3>
            <p>Every desk reads the same crawl. You don&rsquo;t pay for it twice.</p>
          </div>
          <div>
            <h3>One voice</h3>
            <p>Your blog, your posts and your ads sound like the same company. Because they are.</p>
          </div>
          <div>
            <h3>One inbox</h3>
            <p>Approvals arrive batched, not as five pings about five alt tags.</p>
          </div>
        </div>
        {overlaps.length > 0 && (
          <details className="acc" style={{ marginTop: "1.8rem" }}>
            <summary>Where the desks overlap, and who wins</summary>
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
              <li>Monthly. Cancel whenever. No onboarding fee, no call to book.</li>
              <li>Cancel and every fix stays live, because it&rsquo;s in your website, not our dashboard.</li>
              <li>Your drafts are yours, and the whole workspace exports as a file anytime.</li>
            </ul>
          </div>
        </details>
      </section>

      <CtaBand
        title="Start small. Grow into it."
        body="Most people start with the free audit, then add desks once they trust us. That's the right order."
        primary={{ href: "/app/new", label: "Audit my site free" }}
        secondary={{ href: "/the-firm", label: "Meet the team" }}
      />
    </MarketingChrome>
  );
}
