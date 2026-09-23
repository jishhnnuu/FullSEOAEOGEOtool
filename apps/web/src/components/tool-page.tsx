"use client";

import Link from "next/link";

import type { ToolDef } from "@/content/tools";

import { ToolForm, useInspector } from "./tool-runner";
import { ToolView } from "./tool-views";

/**
 * The interactive half of a tool page.
 *
 * Kept separate from the route so the explanation, the FAQ and the structured
 * data stay server-rendered. An answer engine has to be able to read what this
 * tool does without executing anything, which is the argument the tool itself
 * makes about everyone else's pages.
 */
export function ToolPage({ tool }: { tool: ToolDef }) {
  const { state, run, reset } = useInspector(tool);

  return (
    <section className="section section-tight">
      <ToolForm tool={tool} onRun={run} running={state.phase === "running"} />

      {state.phase === "running" ? (
        <p className="tool-note">
          Fetching the page from the Worker, because a browser cannot read another origin. Nothing is stored.
        </p>
      ) : null}

      {state.phase === "error" ? (
        <div className="tool-error">
          <p>{state.reason}</p>
          <button type="button" className="button small" onClick={reset}>
            Try another address
          </button>
        </div>
      ) : null}

      {state.phase === "done" ? (
        <div className="tool-result">
          <div className="tool-result-head">
            <div>
              <strong>{state.result.page.finalUrl}</strong>
              <p className="small muted">
                HTTP {state.result.page.status} · {Math.round(state.result.page.bytes / 1024)} KB ·{" "}
                {state.result.page.elapsedMs} ms
                {state.result.page.redirectChain.length > 1
                  ? ` · ${state.result.page.redirectChain.length - 1} redirect${state.result.page.redirectChain.length > 2 ? "s" : ""}`
                  : ""}
              </p>
            </div>
            <button type="button" className="button small" onClick={reset}>
              Check another
            </button>
          </div>

          {state.result.page.status === 0 || state.result.page.error ? (
            <p className="tool-verdict bad">
              {state.result.page.error ?? "That page could not be fetched."}
            </p>
          ) : (
            <ToolView tool={tool} result={state.result} findings={state.findings} />
          )}

          <div className="tool-upsell">
            <p className="small">
              This is one page and one question. The full audit crawls the site, runs all 90 checks and writes the
              fixes rather than listing them. It is also free and needs no account.
            </p>
            <Link href="/app/new" className="button primary">
              Run the full audit
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
