import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Seat } from "@/components/seat";
import { DESKS, deskPrice, managerFor, WHOLE_AGENCY, type Desk } from "@/lib/desks";
import { PLANS } from "@/lib/plans";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

/**
 * One desk, as its own buyer reads it.
 *
 * Four front doors rather than one page with a word swapped, because search
 * demand is service shaped and so is budget. Somebody arrives having typed
 * "seo agency", not "digital marketing platform".
 *
 * The page is built the way docs/VOICE-AND-LOOK.md says: the thing to try is
 * in the hero, every section is a headline and a line, and the long honest
 * parts (where the desk stops, what it refuses, who is on it) sit in
 * accordions. They are still on the page and still in the FAQ markup, so
 * nothing true was deleted to make it shorter.
 *
 * `extra` is a slot for the one thing a desk needs that the others do not.
 * Paid uses it for the platform access table, because that desk is the only
 * one whose availability depends on somebody else's review queue.
 */
export function DeskPage({ desk, extra }: { desk: Desk; extra?: React.ReactNode }) {
  const manager = managerFor(desk);
  const plan = desk.requiresPlan ? PLANS[desk.requiresPlan] : null;
  const others = DESKS.filter((d) => d.key !== desk.key);

  const faq = [
    {
      q: `What does the ${desk.label.toLowerCase()} desk do?`,
      a: desk.work.map((w) => w.title).join(". ") + ".",
    },
    {
      q: "What can it do today?",
      a: manager.delivers,
    },
    {
      q: "What will it refuse to do?",
      a: manager.refusals[0],
    },
    {
      q: "What does it cost?",
      a: plan
        ? `${deskPrice(desk)} per site per month on the ${plan.name} plan. No retainer, no minimum term, no call to book. An agency charges ${desk.agencyPrice} for the same scope.`
        : deskPrice(desk),
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

      {/* 1. The claim, and the thing to try, in the desk's own colour. */}
      <section className="section section-alt desk-hero-band seat-room" data-desk={desk.key}>
        <h1 className="hero-title">
          <Seat text={desk.headline} word={desk.seat} />
        </h1>
        <p className="hero-lede">{desk.lede}</p>
        <div className="hero-actions">
          <Link href={desk.tryIt.href} className="big-button primary">{desk.tryIt.label} &rarr;</Link>
          <Link href="#price" className="big-button">See the price</Link>
        </div>
        <p className="hero-status">
          <span className="dot" aria-hidden="true" />
          <span><b>{desk.ready.label}.</b> {desk.readyNote}</span>
        </p>
      </section>

      {/* 2. The objection this buyer arrives with, answered in one line. */}
      <section className="section">
        <blockquote className="worry-quote">{desk.worry}</blockquote>
        <p className="section-lede" style={{ marginBottom: 0 }}>{desk.answer}</p>
      </section>

      {/* 3. The work, with who presses the button on each piece. */}
      <section className="section section-alt">
        <h2 className="section-title">What you get.</h2>
        <div className="work-grid" style={{ marginTop: "1.4rem" }}>
          {desk.work.map((item) => (
            <div className="work-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className={item.applied ? "tag go" : "tag part"}>
                {item.applied ? "Done for you" : "Drafted for you"}
              </span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: "1rem" }}>
          &ldquo;Done for you&rdquo; means we ship it and check it went live. &ldquo;Drafted for you&rdquo; means
          it&rsquo;s written and waiting for your yes.
        </p>
      </section>

      {/* 4. The honest detail, opt-in. */}
      <section className="section">
        <h2 className="section-title">The small print, in plain English.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>What it can do today, and where it stops</summary>
            <div className="acc-body"><p>{manager.delivers}</p></div>
          </details>
          <details className="acc">
            <summary>Things this desk will never do</summary>
            <div className="acc-body">
              <ul>{manager.refusals.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </div>
          </details>
          <details className="acc">
            <summary>Who does the work</summary>
            <div className="acc-body">
              <div className="firm-people" style={{ marginTop: "0.4rem" }}>
                {manager.team.map((member) => (
                  <div className="person" key={member.key}>
                    <strong>{member.name}</strong>
                    <span className="dept">{member.department}</span>
                    <p>{member.role}</p>
                    <span className="never-line"><b>Never</b>{member.never}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
          <details className="acc">
            <summary>Who this is for</summary>
            <div className="acc-body"><p>{desk.audience}</p></div>
          </details>
        </div>
      </section>

      {extra}

      {/* 5. Price, next to what the alternative costs. */}
      <section className="section section-alt" id="price">
        <h2 className="section-title">What it costs.</h2>
        <div className="price-strip" style={{ marginTop: "1.2rem" }}>
          <div>
            <div className="ps-us">
              {deskPrice(desk)}
              {plan && <span className="small muted" style={{ fontFamily: "inherit", fontWeight: 500 }}> / month</span>}
            </div>
            <div className="small muted">
              {plan ? `Per site, on the ${plan.name} plan. Cancel anytime.` : "Not on a plan yet."}
            </div>
          </div>
          <div className="ps-them">
            A typical agency: <s>{desk.agencyPrice}</s>
          </div>
          <Link href={desk.tryIt.href} className="big-button primary">{desk.tryIt.label}</Link>
        </div>
        <details className="acc" style={{ marginTop: "1rem" }}>
          <summary>Where the agency number comes from</summary>
          <div className="acc-body">
            <p>{desk.agencyBasis}</p>
            <p>
              <Link href="/pricing">Every plan</Link> &middot; <Link href={WHOLE_AGENCY.path}>Every desk on one plan</Link>
            </p>
          </div>
        </details>
      </section>

      {/* 6. The other desks. */}
      <section className="section">
        <h2 className="section-title">Need a hand elsewhere?</h2>
        <div className="fresh-desks three" style={{ marginTop: "1.4rem" }}>
          {others.map((other) => (
            <Link key={other.key} href={other.path} className="fresh-desk" data-desk={other.key}>
              <span className="fd-name">{other.label}</span>
              <span className="fd-line">{other.tagline}</span>
              <span className="fd-foot">
                <span className="fd-status">{other.ready.label}</span>
                <span className="fd-go">Meet them &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand
        title="Want to see it on your site?"
        body="Paste your URL. Four minutes later you'll know what we'd fix first. Free, no signup."
        primary={{ href: "/app/new", label: "Audit my site free" }}
        secondary={{ href: "/inside", label: "Peek inside a live account" }}
      />
    </MarketingChrome>
  );
}
