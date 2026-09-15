"use client";

/**
 * Keeping the browser and the account in step.
 *
 * The browser stays the working copy. Everything the engine produces is
 * written there first, the screens read from there, and a deployment with no
 * database behind it loses nothing. What this adds is that a signed-in account
 * gets a copy on the server, so the work follows you to another machine and a
 * cleared browser is an inconvenience rather than a loss.
 *
 * Every call here fails quietly. A sync that cannot reach the server must
 * never stop an audit that does not need it.
 */

import type { AuditResult } from "@/engine/types";
import { load, update, type Workspace } from "./store";

/** Post a finished run to the account, or under a claim cookie when signed out. */
export async function recordRun(input: {
  url: string;
  status: string;
  result: AuditResult | null;
  startedAt: string;
}): Promise<{ id: string; siteId: string | null } | null> {
  try {
    const response = await fetch("/api/runs", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        status: input.status,
        startedAt: input.startedAt,
        scores: input.result?.scores ?? null,
        summary: input.result
          ? {
              findings: input.result.findings.length,
              fixes: input.result.findings.filter((f) => f.fix).length,
              pages: input.result.inventory.length,
            }
          : null,
        // The payload is the compacted result: scores, findings and fixes,
        // without the crawled page bodies. Those are megabytes and the server
        // has no use for them.
        payload: input.result ? { scores: input.result.scores, findings: input.result.findings } : null,
      }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { id: string; siteId: string | null };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- workspace */

const REVISION_KEY = "seoos.sync.revision";

function heldRevision(): number {
  try {
    return Number(localStorage.getItem(REVISION_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function rememberRevision(revision: number): void {
  try {
    localStorage.setItem(REVISION_KEY, String(revision));
  } catch {
    // A browser refusing storage still gets a working session.
  }
}

/** Send the workspace up. Debounced by the caller, not here. */
export async function pushWorkspace(workspace: Workspace = load()): Promise<boolean> {
  try {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: heldRevision(), workspace }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { revision: number };
    rememberRevision(body.revision);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pull the account's workspace down, once, on sign-in.
 *
 * Only when this browser has nothing of its own. Overwriting a workspace that
 * has sites in it would be the sync destroying work rather than protecting it,
 * and merging two of them silently is worse than either.
 */
export async function pullWorkspace(): Promise<"restored" | "kept_local" | "nothing" | "failed"> {
  try {
    const response = await fetch("/api/workspace", { credentials: "same-origin" });
    if (!response.ok) return "failed";
    const body = (await response.json()) as { revision: number; workspace: Workspace | null };
    if (!body.workspace) return "nothing";
    if (load().sites.length > 0) {
      rememberRevision(body.revision);
      return "kept_local";
    }
    update((workspace) => {
      Object.assign(workspace, body.workspace);
    });
    rememberRevision(body.revision);
    return "restored";
  } catch {
    return "failed";
  }
}
