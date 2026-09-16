"use client";

/**
 * What the platform actually did, as a flat list of dated events.
 *
 * The report needs to answer "what did you do for me" before it answers
 * anything else, and the honest source for that is the record of things that
 * happened rather than a count of things that exist. A finding is not work. A
 * finding that was approved and published is.
 */

import type { WorkItem } from "@/engine/report";
import type { Workspace } from "./store";

export function workFor(workspace: Workspace, siteId: string): WorkItem[] {
  const items: WorkItem[] = [];

  for (const run of workspace.runs) {
    if (run.siteId !== siteId || run.status !== "complete") continue;
    items.push({
      at: run.finishedAt ?? run.startedAt,
      kind: "run_completed",
      what: `Audit of ${run.result?.crawl.fetched ?? 0} pages`,
      url: null,
    });
  }

  for (const approval of workspace.approvals) {
    if (approval.siteId !== siteId) continue;
    if (approval.status === "applied") {
      items.push({
        at: approval.decidedAt ?? approval.createdAt,
        kind: "fix_published",
        what: approval.title,
        url: approval.fix?.target ?? null,
      });
    } else if (approval.status === "approved") {
      items.push({
        at: approval.decidedAt ?? approval.createdAt,
        kind: "fix_approved",
        what: approval.title,
        url: approval.fix?.target ?? null,
      });
    }
  }

  for (const piece of workspace.content) {
    if (piece.siteId !== siteId) continue;
    if (piece.status === "brief") continue;
    items.push({
      at: piece.updatedAt,
      kind: "content_drafted",
      what: piece.title,
      url: piece.publishedUrl,
    });
  }

  // Schema is counted where it was actually written, not where it was found
  // to be missing. The activity log is the only place that knows.
  for (const entry of workspace.activity) {
    if (entry.siteId !== siteId) continue;
    if (entry.action === "schema.published") {
      items.push({ at: entry.at, kind: "schema_added", what: entry.detail, url: null });
    }
    if (entry.action === "link.verified") {
      items.push({ at: entry.at, kind: "link_verified", what: entry.detail, url: null });
    }
    if (entry.action === "mention.found") {
      items.push({ at: entry.at, kind: "mention_found", what: entry.detail, url: null });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}
