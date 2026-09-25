import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS } from "@/lib/desks";
import { CMO_OFFICE, DIRECTOR, MANAGERS, OPERATIONS } from "@/lib/org";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "The firm",
  description:
    "Meet the AI marketing team: one CMO you talk to, four desks, and a specialist for every small job, each with the one thing it will never do.",
  alternates: { canonical: "/the-firm" },
};

/*
 * The roster, in public.
 *
 * This was inside the logged-in product, where nobody who had not already
 * signed up could ever see it, and it is the single most unusual thing in this
 * category. Named specialists each publishing a constraint is what makes
 * "AI agents" read as rigour rather than as slop, because nobody generating
 * slop publishes constraints.
 *
 * Every role and every refusal on this page comes from `roster.generated.ts`,
 * which is built from the agent specs themselves. Headcounts are kept off the
 * page on purpose: a visitor reads "115 AI marketers" as 115 of something
 * big, when each one is a narrow job, and a big number sets an expectation
 * the first bug then breaks.
 */

function People({ people }: { people: { key: string; name: string; department: string; role: string; never: string }[] }) {
  return (
    <div className="firm-people">
      {people.map((member) => (
        <div className="person" key={member.key}>
          <strong>{member.name}</strong>
          <span className="dept">{member.department}</span>
          <p>{member.role}</p>
          <span className="never-line"><b>Never</b>{member.never}</span>
        </div>
      ))}
    </div>
  );
}

export default function TheFirmPage() {
  const live = MANAGERS.filter((m) => m.status === "live");
  const serverOnly = live.flatMap((m) => m.team.filter((t) => !t.runsInBrowser));

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "The firm", path: "/the-firm" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />The team</div>
        <h1 className="hero-title">
          One team. <span className="hl">Tiny</span> jobs.
        </h1>
        <p className="hero-lede">
          Every small job, like writing a page title or checking your ad tracking, has its own AI specialist that
          does only that. You only ever talk to one of them: your CMO.
        </p>
        <div className="hero-actions">
          <Link href="/inside" className="big-button primary">Watch them work &rarr;</Link>
          <Link href="/app/new" className="big-button">Put them on my site</Link>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">The one you talk to.</h2>
        <div className="firm-people one" style={{ marginTop: "1.2rem" }}>
          <div className="person lead">
            <strong>{DIRECTOR.name}</strong>
            <span className="dept">{DIRECTOR.title}</span>
            <p>{DIRECTOR.remit}</p>
            <span className="never-line"><b>Never</b>{DIRECTOR.never}</span>
          </div>
        </div>
        <details className="acc" id="cmo" style={{ marginTop: "1.2rem" }}>
          <summary>The CMO&rsquo;s office</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
            <p>
              They make sure you only ever talk to one agent: short interviews, clear briefs, and plain English on
              everything that reaches you.
            </p>
            <People people={CMO_OFFICE} />
          </div>
        </details>
        <details className="acc">
          <summary>Operations</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
            <p>Shared by every desk: publishing, risk and quality. A risk officer inside one desk would be marking its own homework.</p>
            <People people={OPERATIONS} />
          </div>
        </details>
      </section>

      <section className="section">
        <h2 className="section-title">Four desks.</h2>
        <div className="fresh-desks" style={{ marginTop: "1.4rem" }}>
          {DESKS.map((desk) => (
            <Link key={desk.key} href={desk.path} className="fresh-desk" data-desk={desk.key}>
              <span className="fd-name">{desk.label}</span>
              <span className="fd-line">{desk.tagline}</span>
              <span className="fd-foot">
                <span className="fd-status">{desk.ready.label}</span>
                <span className="fd-go">Visit &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: "1.8rem" }}>
          {live.map((manager) => (
            <details className="acc" key={manager.key} id={manager.key}>
              <summary>Everyone on {manager.name}</summary>
              <div className="acc-body" style={{ maxWidth: "none" }}>
                <p><strong>Led by {manager.title}.</strong> {manager.remit}</p>
                {manager.overlap && <p><strong>Where this desk overlaps another:</strong> {manager.overlap}</p>}
                <People people={manager.team} />
                <p style={{ marginTop: "1rem" }}><strong>What this desk will never do</strong></p>
                <ul>{manager.refusals.map((line, i) => <li key={i}>{line}</li>)}</ul>
              </div>
            </details>
          ))}
          <details className="acc">
            <summary>Why some of them don&rsquo;t run in your browser</summary>
            <div className="acc-body">
              <p>
                The public site runs on a platform that can&rsquo;t run Python, so everything deterministic runs in
                your browser and these agents run on a server installation. The workspace marks each one on screen
                rather than pretending: {serverOnly.map((t) => t.name).join(", ")}.
              </p>
            </div>
          </details>
        </div>
      </section>

      <CtaBand
        title="Watch them work before you hire them."
        body="A real account on our own site, the unfixed bits left in. No signup."
        primary={{ href: "/inside", label: "Look inside" }}
        secondary={{ href: "/pricing", label: "See the prices" }}
      />
    </MarketingChrome>
  );
}
