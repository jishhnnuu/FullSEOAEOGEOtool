import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS, deskPrice, managerFor, WHOLE_AGENCY, type Desk } from "@/lib/desks";
import { PLANS, priceLabel } from "@/lib/plans";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

/**
 * One desk, as its own buyer reads it.
 *
 * Four front doors rather than one page with a word swapped, because search
 * demand is service shaped and so is budget. Somebody arrives having typed
 * "seo agency", not "digital marketing platform", and they have a line in a
 * budget for exactly the thing they typed.
 *
 * A desk that is not built says so here, with the quarter it opens and what it
 * will refuse to do. That costs some visitors. The alternative, a page
 * implying a service exists, costs the only asset this business has.
 */
/**
 * `extra` is a slot for the one thing a desk needs that the others do not.
 *
 * Paid uses it for the platform access table, because that desk is the only
 * one whose availability depends on somebody else's review queue and the
 * honest thing is to publish our position in it.
 */
export function DeskPage({ desk, extra }: { desk: Desk; extra?: React.ReactNode }) {
  const manager = managerFor(desk);
  const open = manager.status === "live";
  const plan = desk.requiresPlan ? PLANS[desk.requiresPlan] : null;
  const others = DESKS.filter((d) => d.key !== desk.key);

  const faq = [
    {
      q: `What does the ${manager.name.toLowerCase()} desk actually do?`,
      a: desk.work.map((w) => w.title).join(". ") + ".",
    },
    {
      q: `What will it refuse to do?`,
      a: manager.refusals[0],
    },
    {
      q: open ? "What does it cost?" : "When does it open?",
      a: open
        ? `${deskPrice(desk)} per site per month on the ${plan?.name} plan. No retainer, no minimum term, no onboarding fee, and no call to book. An agency charges ${desk.agencyPrice} for the same scope.`
        : `${manager.opens}. Until then this page exists so you can see what it will do and what it will refuse, and nothing on it implies the desk is running.`,
    },
  ];

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: manager.name, path: desk.path },
            ]),
            faqNode(faq),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">
          {open ? `${manager.team.length} specialists, working now` : `Not built yet · opens ${manager.opens}`}
        </div>
        <h1 className="hero-title">{desk.headline}</h1>
        <p className="hero-lede">
          {open ? `${manager.team.length} specialists. ` : ""}{desk.lede}
        </p>
        <div className="hero-actions">
          {open ? (
            <>
              <Link href="/inside" className="button primary big-button">Look inside a live account</Link>
              <Link href="/app/new" className="button big-button">See what we would fix this week</Link>
            </>
          ) : (
            <>
              <Link href="/the-firm" className="button primary big-button">See the desks that are built</Link>
              <Link href="/inside" className="button big-button">Look inside a live account</Link>
            </>
          )}
        </div>
        <p className="small faint" style={{ marginTop: "0.9rem" }}>Written for: {desk.audience}</p>
      </section>

      {/* The objection this buyer actually arrives with, answered before anything else. */}
      <section className="section section-alt">
        <div className="eyebrow">The thing you are thinking</div>
        <blockquote className="worry">{desk.worry}</blockquote>
        <p className="section-lede" style={{ marginTop: "1rem" }}>{desk.answer}</p>
      </section>

      <section className="section">
        <div className="eyebrow">The work</div>
        <h2 className="section-title">
          {open ? "What this desk does, and what it applies rather than recommends." : "What this desk will do."}
        </h2>
        <div className="card-grid">
          {desk.work.map((item) => (
            <div className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              {open && (
                <span className="small" style={{ color: item.applied ? "var(--ok)" : "var(--text-faint)" }}>
                  {item.applied ? "Applied, then verified live" : "Drafted for you, never sent by us"}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {open && (
        <section className="section section-alt">
          <div className="eyebrow">The team</div>
          <h2 className="section-title small-title">
            The {manager.team.length} specialists on this desk, and what each one refuses to do.
          </h2>
          <p className="section-lede">
            Read from the agent specifications the runtime validates at boot, not written here. Every one declares the
            tools it may touch, and the first line of its guardrails is the promise it makes to you.
          </p>
          <div className="firm-people" style={{ marginTop: "1.1rem" }}>
            {manager.team.slice(0, 12).map((member) => (
              <div className="person" key={member.key}>
                <strong>{member.name}</strong>
                <span className="dept">{member.department}</span>
                <p>{member.role}</p>
                <span className="never-line"><b>Never</b>{member.never}</span>
              </div>
            ))}
          </div>
          {manager.team.length > 12 && (
            <p style={{ marginTop: "1rem" }}>
              <Link href="/the-firm" className="button">
                All {manager.team.length} on this desk, and the other {DESKS.length - 1} desks
              </Link>
            </p>
          )}
        </section>
      )}

      <section className="section">
        <div className="eyebrow">Where it stops</div>
        <h2 className="section-title small-title">
          What this desk refuses, whatever you ask for.
        </h2>
        <ul className="prose-list">
          {manager.refusals.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </section>

      {extra}

      <section className="section section-alt">
        <div className="eyebrow">Price</div>
        <h2 className="section-title">
          {open ? `${deskPrice(desk)} a month. An agency charges ${desk.agencyPrice}.` : `Opens ${manager.opens}.`}
        </h2>
        <p className="section-lede">
          {open ? (
            <>
              Per site, per month, on the {plan?.name} plan. No retainer, no minimum term, no onboarding fee and no
              call to book. The agency figure is {desk.agencyBasis.toLowerCase()}
            </>
          ) : (
            <>
              Nothing to buy here yet. When this desk opens it joins the plans that already exist rather than adding a
              new price, and the {DESKS.filter((d) => managerFor(d).status === "live").length} desks that are built
              are available today.
            </>
          )}
        </p>
        <div className="hero-actions" style={{ marginTop: "1.1rem" }}>
          <Link href="/pricing" className="button primary">What each plan permits</Link>
          <Link href={WHOLE_AGENCY.path} className="button">Every desk on one plan</Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title small-title">The other desks</h2>
        <div className="desk-tiles">
          {others.map((other) => {
            const m = managerFor(other);
            return (
              <Link key={other.key} href={other.path} className={m.status === "live" ? "desk-tile" : "desk-tile soon"}>
                <span className="desk-name">{other.label}</span>
                <span className="desk-count">
                  {m.status === "live" ? `${m.team.length} specialists` : `Opens ${m.opens}`}
                </span>
                <span className="desk-line">{other.headline}</span>
                <span className="desk-price">{deskPrice(other)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <CtaBand
        title={open ? "See it running before you decide" : "Two desks are running today"}
        body="A real account on our own site, with the findings we have not fixed still in it. No signup, no email, no domain to enter."
        primary={{ href: "/inside", label: "Look inside a live account" }}
        secondary={{ href: "/the-firm", label: `Meet all ${DESKS.length} desks` }}
      />
    </MarketingChrome>
  );
}
