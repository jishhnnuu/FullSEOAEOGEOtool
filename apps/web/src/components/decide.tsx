"use client";

/**
 * The decision panel that sits above the findings list.
 *
 * A real site produces 150 findings and the queue asks for 150 decisions.
 * Founders make three and close the tab. This collapses the same work into a
 * handful of decisions without collapsing the approval gate itself: a
 * site-wide or irreversible change is still presented on its own, and anything
 * that writes prose is counted rather than bundled.
 *
 * The number that matters on screen is the ratio. Someone looking at "112
 * findings across 4 batched decisions" understands immediately that the list
 * below is not 112 pieces of work.
 */

import { useMemo, useState } from "react";

import { type Batch, buildBatches, summarise } from "@/engine/batches";
import type { Finding } from "@/engine/types";

import { Badge, Card } from "./ui";

const KIND_LABEL: Record<Batch["kind"], string> = {
  mechanical: "One decision",
  root_file: "One file",
  editorial: "Needs reading",
  structural: "Read this one",
  manual: "Nothing to apply",
};

const KIND_TONE: Record<Batch["kind"], "ok" | "warn" | "bad" | "muted"> = {
  mechanical: "ok",
  root_file: "ok",
  editorial: "warn",
  structural: "bad",
  manual: "muted",
};

export function DecidePanel({
  findings,
  queuedIds,
  onQueue,
}: {
  findings: Finding[];
  queuedIds: Set<string>;
  onQueue: (items: Finding[]) => void;
}) {
  const [open, setOpen] = useState(true);

  // Only what is still outstanding. A batch that has already been queued is
  // not a decision any more, and showing it as one inflates the count.
  const batches = useMemo(
    () => buildBatches(findings.filter((f) => !queuedIds.has(f.id))),
    [findings, queuedIds],
  );

  if (batches.length === 0) return null;

  const decisions = batches.filter((b) => b.batchable);

  return (
    <Card>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0 }}>Decide this in {decisions.length || batches.length}</h3>
          <p className="small muted" style={{ margin: "0.3rem 0 0" }}>{summarise(batches)}</p>
        </div>
        <button type="button" className="button small" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="stack-sm" style={{ marginTop: "1rem" }}>
          {batches.map((batch) => {
            const ready = batch.findings.filter((f) => f.fix);
            return (
              <div className="decide-row" key={batch.id}>
                <div className="decide-main">
                  <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                    <Badge kind={KIND_TONE[batch.kind]}>{KIND_LABEL[batch.kind]}</Badge>
                    <strong>{batch.title}</strong>
                  </div>
                  <p className="small muted" style={{ margin: "0.35rem 0 0" }}>{batch.rationale}</p>
                  <div className="tiny faint" style={{ marginTop: "0.3rem" }}>
                    {batch.findings.length} finding{batch.findings.length === 1 ? "" : "s"} · {batch.pages} page
                    {batch.pages === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="decide-action">
                  {/*
                    Only a batchable group gets a single button. The others are
                    deliberately left without one: a structural change and a
                    generated paragraph both need a person to look at the
                    before and after, and a button here would be the exact
                    rubber stamp this panel exists to avoid.
                  */}
                  {batch.batchable && ready.length > 0 ? (
                    <button type="button" className="button primary small" onClick={() => onQueue(ready)}>
                      Queue all {ready.length}
                    </button>
                  ) : (
                    <span className="tiny faint">Review below</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
