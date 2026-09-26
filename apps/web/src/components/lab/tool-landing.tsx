import Link from "next/link";

import { LabBuddy, type BuddyTool } from "@/components/crew/scenes";
import { LabCta } from "@/components/lab/chrome";
import { faqNode, graph } from "@/lib/schema";

/**
 * One tool's front page: the promise, the scientist who runs it, what
 * it does, what the readout looks like, and the button into the workbench.
 * Every tool uses this shape, so they read as one lab, and each sets
 * its own tone and assistant, so none is mistaken for another.
 */
export function ToolLanding({
  tool,
  eyebrow,
  title,
  glow,
  lede,
  primary,
  secondary,
  does,
  readout,
  faq,
  children,
}: {
  tool: BuddyTool;
  eyebrow: string;
  title: string;
  glow: string;
  lede: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  does: { title: string; body: string }[];
  readout: { label: string; value: string; tone?: "ok" | "hi" | "dim" }[];
  faq: { q: string; a: string }[];
  children?: React.ReactNode;
}) {
  return (
    <div className={`tone-${tool}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(faq)) }} />

      <section className="lab-section lab-hero">
        <div>
          <span className="lab-eyebrow">{eyebrow}</span>
          <h1 className="lab-title">
            {title} <span className="glow">{glow}</span>
          </h1>
          <p className="lab-lede">{lede}</p>
          <div className="lab-actions">
            <Link href={primary.href} className="lab-btn">{primary.label} &rarr;</Link>
            {secondary ? <Link href={secondary.href} className="lab-btn ghost">{secondary.label}</Link> : null}
          </div>
          <div className="lab-status">
            <span>Free to start</span>
            <span>Runs in your browser</span>
            <span>Plain English</span>
          </div>
        </div>
        <LabBuddy tool={tool} />
      </section>

      <section className="lab-section">
        <span className="lab-eyebrow">What it does</span>
        <div className="lab-steps">
          {does.map((item) => (
            <div className="lab-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-split">
          <div>
            <span className="lab-eyebrow">The readout</span>
            <h2 className="lab-h2" style={{ marginTop: "0.9rem" }}>What you get back.</h2>
            <p className="lab-lede">Straight answers you can act on, with anything that couldn&rsquo;t be measured labelled as such.</p>
            <div className="lab-actions">
              <Link href={primary.href} className="lab-btn">{primary.label} &rarr;</Link>
            </div>
          </div>
          <div className="lab-terminal" aria-label="An example readout">
            {readout.map((row) => (
              <div key={row.label}>
                {row.label} <span className={row.tone ?? "ok"}>{row.value}</span>
              </div>
            ))}
            <div className="dim" style={{ marginTop: "0.5rem" }}>example readout, for illustration</div>
          </div>
        </div>
      </section>

      {children}

      <section className="lab-section">
        <span className="lab-eyebrow">Questions</span>
        <div style={{ marginTop: "1.2rem" }}>
          {faq.map((item) => (
            <details className="acc" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body"><p>{item.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      <LabCta title="Ready when you are." body="Free, no signup for the first run." primary={primary} secondary={{ href: "/", label: "Rather have it done for you?" }} />
    </div>
  );
}
