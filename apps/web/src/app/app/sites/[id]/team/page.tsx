"use client";

import Link from "next/link";

import { DIRECTOR, MANAGERS, OPERATIONS, headcount, placed } from "@/lib/org";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

/*
 * The organisation, as a page.
 *
 * Three tiers: the director you speak to, the managers it assigns work to, and
 * the teams under each manager. Every agent carries the one thing it will not
 * do, because a feature list makes claims and a refusal list makes promises.
 *
 * Two honesty rules hold this page together. A desk that is not built says so
 * with the quarter it opens, rather than being omitted so the roster looks
 * fuller. An agent whose work needs the server installation is marked, rather
 * than appearing to be running in a browser that cannot run it.
 */

export default function TeamPage() {
  const { site } = useSite();
  if (!site) return null;

  const live = MANAGERS.filter((m) => m.status === "live");
  const planned = MANAGERS.filter((m) => m.status === "planned");
  const serverOnly = live.flatMap((m) => m.team.filter((t) => !t.runsInBrowser));

  return (
    <>
      <PageHeader
        title="The organisation"
        description={`${headcount()} agents, ${placed()} of them placed on a desk below. Every role and every refusal on this page is read from the agent specs themselves rather than written here, so the page cannot claim a headcount the roster does not have.`}
      />

      <div className="org-tier">
        <div className="org-tier-head">
          <h2>Tier one</h2>
          <span className="tiny faint">reports_to: client</span>
        </div>
        <div className="org-people">
          <div className="person lead">
            <strong>{DIRECTOR.name}</strong>
            <div className="dept">{DIRECTOR.title}</div>
            <p>{DIRECTOR.remit}</p>
            <div className="never"><b>Never</b>{DIRECTOR.never}</div>
          </div>
        </div>
      </div>

      <div className="org-tier">
        <div className="org-tier-head">
          <h2>Tier two, the desks</h2>
          <span className="tiny faint">reports_to: {DIRECTOR.agent}</span>
        </div>
        <div className="org-people half">
          {MANAGERS.map((manager) => (
            <div
              key={manager.key}
              id={manager.key}
              className={manager.status === "planned" ? "person planned" : "person lead"}
            >
              <strong>{manager.name}</strong>
              <div className="dept">
                {manager.title}
                {manager.status === "planned" ? ` · opens ${manager.opens}` : ` · ${manager.team.length} agents`}
              </div>
              <p>{manager.remit}</p>
              <div className="where">
                {manager.method.map((step, i) => (
                  <div key={i}>{i + 1}. {step}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="org-tier">
        <div className="org-tier-head">
          <h2>Operations</h2>
          <span className="tiny faint">reports_to: {DIRECTOR.agent}</span>
        </div>
        <p className="small muted" style={{ marginTop: "-0.3rem", marginBottom: "0.8rem" }}>
          Shared across every desk rather than owned by one, because publishing a fix and publishing a draft is the
          same publisher, and a risk officer that reported to a desk would be reviewing its own work.
        </p>
        <div className="org-people wide">
          {OPERATIONS.map((member) => (
            <div className="person" key={member.key}>
              <strong>{member.name}</strong>
              <div className="dept">{member.department}</div>
              <p>{member.role}</p>
              <div className="never"><b>Never</b>{member.never}</div>
              {!member.runsInBrowser && (
                <div className="where">Needs the server installation. Not running in this browser.</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {live.map((manager) => (
        <div className="org-tier" key={manager.key}>
          <div className="org-tier-head">
            <h2>{manager.name}, tier three</h2>
            <span className="tiny faint">reports_to: {manager.agent}</span>
          </div>
          {manager.overlap && (
            <p className="small muted" style={{ marginTop: "-0.3rem", marginBottom: "0.8rem", maxWidth: "80ch" }}>
              <strong>Where this desk overlaps another.</strong> {manager.overlap}
            </p>
          )}
          <div className="org-people wide">
            {manager.team.map((member) => (
              <div className="person" key={member.key}>
                <strong>{member.name}</strong>
                <div className="dept">{member.department}</div>
                <p>{member.role}</p>
                <div className="never"><b>Never</b>{member.never}</div>
                {!member.runsInBrowser && (
                  <div className="where">Needs the server installation. Not running in this browser.</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <Card title="What each desk refuses, whatever you ask">
        <div className="stack">
          {live.map((manager) => (
            <div key={manager.key}>
              <div className="tiny faint" style={{ marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {manager.name}
              </div>
              <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {manager.refusals.map((line, i) => <li key={i} style={{ marginBottom: "0.3rem" }}>{line}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {planned.length > 0 && (
        <Notice kind="warn" title={`${planned.length} desks are not built yet`}>
          {planned.map((m) => `${m.name} opens ${m.opens}`).join(", ")}. They are listed here rather than hidden,
          because a roadmap you can read is worth more than a features page implying everything already exists. When
          they open, they follow the same pattern: a lead reporting to the director, a team in departments, a
          discovery mission that gates the rest, and a published list of what the desk refuses to do.
        </Notice>
      )}

      {serverOnly.length > 0 && (
        <Notice kind="warn" title={`${serverOnly.length} agents need the server installation`}>
          The public deployment runs on Cloudflare Workers, which cannot run Python, so the audit and everything
          deterministic runs here in your browser and these agents run on a server installation instead. They are
          named rather than quietly absent:{" "}
          {serverOnly.map((t) => t.name).join(", ")}.{" "}
          <Link href={`/app/sites/${site.id}/integrations`}>What is connected</Link>.
        </Notice>
      )}
    </>
  );
}
