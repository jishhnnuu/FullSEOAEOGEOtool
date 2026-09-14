"use client";

import { useParams } from "next/navigation";

import { latestResult, runsForSite, siteById, type RunRecord, type SiteRecord, type Workspace } from "./store";
import { useWorkspace } from "./useWorkspace";
import type { AuditResult } from "@/engine/types";

/** Everything a site screen needs, resolved once. */
export function useSite(): {
  workspace: Workspace;
  mutate: (fn: (w: Workspace) => void) => void;
  siteId: string;
  site: SiteRecord | undefined;
  result: AuditResult | null;
  runs: RunRecord[];
} {
  const params = useParams<{ id: string }>();
  const siteId = params?.id ?? "";
  const [workspace, mutate] = useWorkspace();
  return {
    workspace,
    mutate,
    siteId,
    site: siteById(workspace, siteId),
    result: latestResult(workspace, siteId),
    runs: runsForSite(workspace, siteId),
  };
}
