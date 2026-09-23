import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS, deskPrice, managerFor, WHOLE_AGENCY } from "@/lib/desks";
import { MANAGERS, headcount } from "@/lib/org";
import { PLANS, priceLabel } from "@/lib/plans";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "The whole agency",
  description:
    "Every desk on one plan, sharing one research pass rather than two. The upsell for people who have already decided, not the front door for people who have not.",
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
  const live = DESKS.filter((d) => managerFor(d).status === "live");
  const planned = DESKS.filter((d) => managerFor(d).status === "planned");
  const liveTeam = live.reduce((n, d) => n + managerFor(d).team.length, 0);

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

      <section className="section">
        <div className="eyebrow">Every desk, one plan</div>
        <h1 className="hero-title">Replace the retainer, not one line of it.</h1>
        <p className="hero-lede">
          {priceLabel(plan)} per site per month on {plan.name}. Every desk that exists, and every desk that opens
          later, at the same price. {WHOLE_AGENCY.reason}
        </p>
        <div className="hero-actions">
          <Link href="/inside" className="button primary big-button">Look inside a live account</Link>
          <Link href="/pricing" className="button big-button">What the plan permits</Link>
        </div>
      </section>

      <section className="section section-alt">
        <div className="eyebrow">What you get</div>
        <h2 className="section-title small-title">
          {liveTeam} specialists working today, and {planned.length} desks that join without a price change.
        </h2>
        <div className="desk-tiles">
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
                <span className="desk-price">{open ? "Included" : deskPrice(desk)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">Why it is not the sum of the parts</div>
        <h2 className="section-title">The research runs once, not twice.</h2>
        <div className="card-grid">
          <div className="card">
            <h3>One crawl, two desks</h3>
            <p>
              Search and content read the same pages. An agency staffs that as two teams and bills you for both, and
              then the two teams contradict each other in the same monthly deck.
            </p>
          </div>
          <div className="card">
            <h3>One point of view</h3>
            <p>
              Approved once and enforced at the gate. Everything either desk commissions has to ladder to it, so the
              technical programme and the content programme argue the same thing.
            </p>
          </div>
          <div className="card">
            <h3>One writer</h3>
            <p>
              The production line is shared on purpose. You should not be able to tell which desk commissioned a piece
              by reading it, and neither desk briefs the writer without the other knowing.
            </p>
          </div>
          <div className="card">
            <h3>One queue, one director</h3>
            <p>
              Approvals are batched across every desk rather than arriving separately. Five notifications about five
              alt tags is a failure of the system, not a busy week.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="eyebrow">Where the desks overlap</div>
        <h2 className="section-title small-title">Both desks write. They are not doing the same job.</h2>
        {MANAGERS.filter((m) => m.status === "live" && m.overlap).map((m) => (
          <p key={m.key}><strong>{m.name}.</strong> {m.overlap}</p>
        ))}
      </section>

      <section className="section">
        <h2 className="section-title small-title">What you are signing</h2>
        <ul className="prose-list">
          <li><strong>No minimum term.</strong> Monthly. Cancel whenever.</li>
          <li><strong>No onboarding fee</strong> and no call to book. The price is on this page.</li>
          <li>
            <strong>Cancel and the fixes stay applied</strong>, because they are in your CMS rather than in our
            dashboard. The drafts are yours. The whole workspace exports as JSON at any time.
          </li>
          <li>
            <strong>{planned.length} desks are not built.</strong>{" "}
            {planned.map((d) => `${d.label} opens ${managerFor(d).opens}`).join(", ")}. They are named here rather
            than implied, and they join this plan without a price change.
          </li>
        </ul>
      </section>

      <CtaBand
        title={`All ${headcount()} of them, working on one site`}
        body="Look at a real account first. No signup, no email, no domain to enter, and the findings we have not fixed on our own site are still in it."
        primary={{ href: "/inside", label: "Look inside a live account" }}
        secondary={{ href: "/the-firm", label: "Meet the firm" }}
      />
    </MarketingChrome>
  );
}
