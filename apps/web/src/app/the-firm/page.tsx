import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { DESKS } from "@/lib/desks";
import { CMO_OFFICE, DIRECTOR, MANAGERS, OPERATIONS } from "@/lib/org";
import { BOOK } from "@/lib/services";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "The team",
  description:
    "A marketing specialist looks after your account. Behind them, an AI CMO and an AI team for each service do the legwork, each AI agent with the one thing it will never do.",
  alternates: { canonical: "/the-firm" },
};

/*
 * The team, people first.
 *
 * The founder deciding whether to trust us wants to know who they would be
 * dealing with, so the person comes first and the AI second. The AI roster is
 * still here in full, because naming every specialist and the one thing each
 * refuses is what makes "AI powered" read as rigour rather than as slop.
 *
 * Every AI role and refusal on this page comes from `roster.generated.ts`,
 * which is built from the agent specs themselves. Headcounts stay off the
 * page: "115 AI marketers" reads as 115 of something big, when each is one
 * narrow job.
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
              { name: "The team", path: "/the-firm" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />The team</div>
        <h1 className="hero-title">
          Specialists up front. <span className="hl">AI</span> behind them.
        </h1>
        <p className="hero-lede">
          You talk to a marketing specialist who knows your business. They run an AI team that does the research, the fixes, the
          drafts and the reports, so their time goes on decisions about your business.
        </p>
        <div className="hero-actions">
          <Link href={BOOK.href} className="big-button primary">Meet us on a call &rarr;</Link>
          <Link href="/inside" className="big-button">See the dashboard</Link>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">The specialist you talk to.</h2>
        <div className="duo" style={{ marginTop: "1.4rem" }}>
          <div className="duo-card person">
            <span className="duo-tag">Your specialist</span>
            <h3>A marketing specialist on our team</h3>
            <ul>
              <li>Runs your free call and learns your business</li>
              <li>Sets up your website, Google and ad accounts with you</li>
              <li>Directs the AI team and checks what it makes</li>
              <li>Sends you work to approve, and explains the results</li>
              <li>Is who you contact when something needs a human</li>
            </ul>
          </div>
          <div className="duo-card ai">
            <span className="duo-tag">{DIRECTOR.name}</span>
            <h3>{DIRECTOR.title}</h3>
            <p>{DIRECTOR.remit}</p>
            <p className="small" style={{ marginTop: "0.6rem" }}><b>Never:</b> {DIRECTOR.never}</p>
          </div>
        </div>
        <details className="acc" id="cmo" style={{ marginTop: "1.2rem" }}>
          <summary>The AI CMO&rsquo;s office</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
            <p>Short interviews, clear briefs, and plain English on everything that reaches you.</p>
            <People people={CMO_OFFICE} />
          </div>
        </details>
        <details className="acc">
          <summary>Operations</summary>
          <div className="acc-body" style={{ maxWidth: "none" }}>
            <p>Shared by every team: publishing, risk and quality. A risk officer inside one team would be marking its own homework.</p>
            <People people={OPERATIONS} />
          </div>
        </details>
      </section>

      <section className="section">
        <h2 className="section-title">An AI team for each service.</h2>
        <p className="section-lede">Each small job has its own AI agent that does only that, and one thing it will never do.</p>
        <div className="fresh-desks" style={{ marginTop: "1.4rem" }}>
          {DESKS.map((desk) => (
            <Link key={desk.key} href={desk.path} className="fresh-desk" data-desk={desk.key}>
              <span className="fd-name">{desk.label}</span>
              <span className="fd-line">{desk.tagline}</span>
              <span className="fd-foot">
                <span className="fd-status">{desk.ready.label}</span>
                <span className="fd-go">Look &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: "1.8rem" }}>
          {live.map((manager) => (
            <details className="acc" key={manager.key} id={manager.key}>
              <summary>Everyone on the {manager.name.toLowerCase()} team</summary>
              <div className="acc-body" style={{ maxWidth: "none" }}>
                <p><strong>Led by the AI {manager.title.toLowerCase()}, under your specialist.</strong> {manager.remit}</p>
                {manager.overlap && <p><strong>Where this team overlaps another:</strong> {manager.overlap}</p>}
                <People people={manager.team} />
                <p style={{ marginTop: "1rem" }}><strong>What this team will never do</strong></p>
                <ul>{manager.refusals.map((line, i) => <li key={i}>{line}</li>)}</ul>
              </div>
            </details>
          ))}
          <details className="acc">
            <summary>Why some of them don&rsquo;t run in your browser</summary>
            <div className="acc-body">
              <p>
                The public site runs on a platform that can&rsquo;t run Python, so everything deterministic runs in
                your browser and these agents run on a server installation. The dashboard marks each one on screen
                rather than pretending: {serverOnly.map((t) => t.name).join(", ")}.
              </p>
            </div>
          </details>
        </div>
      </section>

      <CtaBand title="Meet the specialist behind it." />
    </MarketingChrome>
  );
}
