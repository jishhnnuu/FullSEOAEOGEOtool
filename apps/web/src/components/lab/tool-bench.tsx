import Link from "next/link";

import { labPath } from "@/lib/brand";

/**
 * The frame around an instrument that already exists (the voice check, the
 * social teardown, the budget check). Each gets its own room: the writing
 * desk puts the tool on a sheet of paper, the signal room puts a scanner
 * above it, the budget console puts the learning-floor gauge beside it. The
 * tool inside is the real one, unchanged.
 */
export function ToolBench({
  tool,
  path,
  title,
  lead,
  layout,
  aside,
  children,
  after,
}: {
  tool: "content" | "social" | "ads";
  path: string;
  title: string;
  lead: string;
  layout: "desk" | "signal" | "console";
  aside: React.ReactNode;
  children: React.ReactNode;
  after?: React.ReactNode;
}) {
  return (
    <div className={`wb wb-${layout} tone-${tool}`} style={{ display: "block" }}>
      <div className="wb-bar">
        <div>
          <div className="wb-crumbs lab-mono">
            <Link href={labPath()}>thymelab</Link> / <Link href={labPath(`/${path}`)}>{path}</Link> / <b>workbench</b>
          </div>
          <h1 className="wb-title">{title}</h1>
        </div>
        <span className="wb-state">Ready</span>
      </div>
      <p className="lab-muted" style={{ marginTop: "-0.4rem", marginBottom: "1.2rem", maxWidth: "70ch" }}>{lead}</p>

      {layout === "desk" ? (
        <div className="wb-desk">
          <aside className="wb-notes">{aside}</aside>
          <div className="wb-paper">{children}</div>
        </div>
      ) : null}

      {layout === "signal" ? (
        <div className="wb-signal">
          <div>
            <div className="wb-radar" aria-hidden="true">
              <i /><i /><i />
              <div className="wb-radar-text">
                <strong>Listening for what works</strong>
                <span className="lab-muted small">Public posts only. No guessed reach.</span>
              </div>
            </div>
            <div className="wb-main">{children}</div>
          </div>
          <aside className="wb-rail">{aside}</aside>
        </div>
      ) : null}

      {layout === "console" ? (
        <div className="wb-console">
          <aside className="wb-rail">{aside}</aside>
          <div className="wb-main">{children}</div>
        </div>
      ) : null}

      {after ? <div style={{ marginTop: "2rem" }}>{after}</div> : null}
    </div>
  );
}
