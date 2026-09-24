import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS, managerFor } from "@/lib/desks";
import { CMO_OFFICE, DIRECTOR, MANAGERS, OPERATIONS, headcount, placed } from "@/lib/org";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "The firm",
  description:
    `All ${headcount()} specialists, in three tiers, each with the one thing it refuses to do. Read from the agent specifications the runtime validates at boot, not written on a marketing page.`,
  alternates: { canonical: "/the-firm" },
};

/*
 * The roster, in public.
 *
 * This was inside the logged-in product, where nobody who had not already
 * signed up could ever see it, and it is the single most unusual thing in this
 * category. Eighty named specialists each publishing a constraint is what
 * makes "AI agents" read as rigour rather than as slop, because nobody
 * generating slop publishes constraints.
 *
 * Every role and every refusal on this page comes from `roster.generated.ts`,
 * which is built from the agent specs themselves. The page cannot claim a
 * headcount the roster does not have, and it prints both numbers so the
 * difference is visible rather than rounded away.
 */

export default function TheFirmPage() {
  const live = MANAGERS.filter((m) => m.status === "live");
  const planned = MANAGERS.filter((m) => m.status === "planned");
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

      <section className="section">
        <div className="eyebrow">The firm</div>
        <h1 className="section-title">{headcount()} specialists, and what each one refuses to do.</h1>
        <p className="section-lede">
          An agency shows you four headshots and calls it a team page. This is the whole roster: every agent, the job
          it owns, and the first line of its guardrails, which is the thing it will not do whatever anybody asks. All
          of it is read from the specifications the runtime validates when it starts, so this page cannot claim a
          headcount the roster does not have. It shows {placed()} of {headcount()}.
        </p>
      </section>

      <section className="section section-tight">
        <div className="firm-tier">
          <div className="firm-tier-head">
            <h2>Tier one</h2>
            <span className="small faint mono">reports_to: client</span>
          </div>
          <div className="firm-people one">
            <div className="person lead">
              <strong>{DIRECTOR.name}</strong>
              <span className="dept">{DIRECTOR.title}</span>
              <p>{DIRECTOR.remit}</p>
              <span className="never-line"><b>Never</b>{DIRECTOR.never}</span>
            </div>
          </div>
        </div>

        <div className="firm-tier">
          <div className="firm-tier-head">
            <h2>Tier two, the desks</h2>
            <span className="small faint mono">reports_to: {DIRECTOR.agent}</span>
          </div>
          <div className="firm-people two">
            {DESKS.map((desk) => {
              const manager = managerFor(desk);
              return (
                <Link
                  key={desk.key}
                  href={desk.path}
                  className={manager.status === "planned" ? "person planned link" : "person lead link"}
                >
                  <strong>{manager.name}</strong>
                  <span className="dept">
                    {manager.title}
                    {manager.status === "planned"
                      ? ` · opens ${manager.opens}`
                      : ` · ${manager.team.length} specialists`}
                  </span>
                  <p>{manager.remit}</p>
                  <span className="never-line" style={{ color: "var(--accent)" }}>
                    <b>Read</b>{desk.headline}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="firm-tier" id="cmo">
          <div className="firm-tier-head">
            <h2>The CMO office</h2>
            <span className="small faint mono">reports_to: chief-marketing-officer</span>
          </div>
          <p className="small muted" style={{ marginTop: "-0.4rem", marginBottom: "0.9rem", maxWidth: "76ch" }}>
            Not a desk. It sells nothing and owns no channel. It is the machinery that lets one agent be the only
            one you speak to: the interview that stops after three questions, the brief so no desk has to come back
            to you, the arbitration when two desks want the same week, and the plain-language pass everything makes
            on the way out.
          </p>
          <div className="firm-people">
            {CMO_OFFICE.map((member) => (
              <div className="person" key={member.key}>
                <strong>{member.name}</strong>
                <span className="dept">{member.department}</span>
                <p>{member.role}</p>
                <span className="never-line"><b>Never</b>{member.never}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="firm-tier">
          <div className="firm-tier-head">
            <h2>Operations</h2>
            <span className="small faint mono">reports_to: {DIRECTOR.agent}</span>
          </div>
          <p className="small muted" style={{ marginTop: "-0.4rem", marginBottom: "0.9rem", maxWidth: "76ch" }}>
            Shared across every desk rather than owned by one, because publishing a fix and publishing a draft is the
            same publisher, and a risk officer reporting to a desk would be reviewing its own work.
          </p>
          <div className="firm-people">
            {OPERATIONS.map((member) => (
              <div className="person" key={member.key}>
                <strong>{member.name}</strong>
                <span className="dept">{member.department}</span>
                <p>{member.role}</p>
                <span className="never-line"><b>Never</b>{member.never}</span>
              </div>
            ))}
          </div>
        </div>

        {live.map((manager) => (
          <div className="firm-tier" key={manager.key} id={manager.key}>
            <div className="firm-tier-head">
              <h2>{manager.name}, tier three</h2>
              <span className="small faint mono">reports_to: {manager.agent}</span>
            </div>
            {manager.overlap && (
              <p className="small muted" style={{ marginTop: "-0.4rem", marginBottom: "0.9rem", maxWidth: "80ch" }}>
                <strong>Where this desk overlaps another.</strong> {manager.overlap}
              </p>
            )}
            <div className="firm-people">
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
        ))}
      </section>

      <section className="section section-alt">
        <h2 className="section-title small-title">What each desk refuses, whatever you ask</h2>
        <div className="card-grid">
          {live.map((manager) => (
            <div className="card" key={manager.key}>
              <h3>{manager.name}</h3>
              <ul className="prose-list" style={{ marginLeft: "1rem" }}>
                {manager.refusals.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title small-title">Two things this page is careful about</h2>
        <p>
          <strong>{planned.length} desks are not built.</strong>{" "}
          {planned.map((m) => `${m.name} opens ${m.opens}`).join(", ")}. They are listed rather than hidden, because a
          roadmap you can read is worth more than a features page implying everything already exists. When they open,
          they follow the same pattern: a lead reporting to the director, a team in departments, a discovery mission
          that gates the rest, and a published list of what the desk refuses to do.
        </p>
        <p>
          <strong>{serverOnly.length} agents need a server installation.</strong> The public deployment runs on
          Cloudflare Workers, which cannot run Python, so the audit and everything deterministic runs in your browser
          and these agents run on a server installation instead. They are named rather than quietly absent, and the
          workspace marks each one on screen:{" "}
          <span className="small muted">{serverOnly.map((t) => t.name).join(", ")}.</span>
        </p>
      </section>

      <CtaBand
        title="Watch them work before you hire them"
        body="A real account, running against our own site, with the findings we have not fixed still in it. No signup, no URL, no email."
        primary={{ href: "/inside", label: "Look inside a live account" }}
        secondary={{ href: "/pricing", label: "See the prices" }}
      />
    </MarketingChrome>
  );
}
