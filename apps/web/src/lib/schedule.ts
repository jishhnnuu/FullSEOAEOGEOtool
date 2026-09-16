"use client";

/**
 * The schedule, from the browser's side.
 *
 * Reads the stored schedule, writes changes back, and exposes the one thing
 * the rest of the app needs from it: which jobs are overdue. The jobs that
 * cannot run headless are picked up here, by the tab that is open, which is
 * the honest half of the arrangement and is printed on the screen.
 */

import { useCallback } from "react";
import useSWR from "swr";

import type { Cadence, JobKey, ScheduleEntry } from "@/engine/schedule";
import { JOBS } from "@/engine/schedule";

export type ScheduleView = ScheduleEntry & {
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
};

export type MeasurementPoint = {
  id: string;
  taken_at: string;
  source: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  ctr: number | null;
  sessions: number | null;
  conversions: number | null;
};

export type MilestoneView = {
  id: string;
  at: string;
  kind: string;
  what: string;
  notified_at: string | null;
  seen_at: string | null;
};

export type SchedulePayload = {
  signedIn: boolean;
  reason?: string;
  schedules: ScheduleView[];
  measurements: MeasurementPoint[];
  milestones: MilestoneView[];
};

async function read(url: string): Promise<SchedulePayload> {
  const response = await fetch(url, { credentials: "same-origin" });
  const body = (await response.json()) as SchedulePayload & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `That request answered ${response.status}.`);
  return body;
}

export function useSchedule(siteId: string | undefined, enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<SchedulePayload, Error>(
    enabled && siteId ? `/api/schedule?site=${encodeURIComponent(siteId)}` : null,
    read,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  async function saveEntry(entry: ScheduleEntry): Promise<void> {
    if (!siteId) return;
    await fetch("/api/schedule", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site: siteId, entry }),
    });
    await mutate();
  }

  async function markRead(): Promise<void> {
    if (!siteId) return;
    await fetch("/api/schedule", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site: siteId, seen: true }),
    });
    await mutate();
  }

  /**
   * Tell the server a stage finished.
   *
   * The audit runs here, so this browser is the only thing that knows. The
   * server deduplicates, so calling it on every render is safe and calling it
   * once is enough.
   */
  const recordMilestones = useCallback(
    async (milestones: { kind: string; what: string }[]): Promise<void> => {
      if (!siteId || milestones.length === 0) return;
      const response = await fetch("/api/schedule", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: siteId, milestones }),
      });
      const body = (await response.json().catch(() => ({}))) as { written?: number };
      if (body.written) await mutate();
    },
    // Stable, so the screen that calls it from an effect does not loop.
    [siteId, mutate],
  );

  return { data: data ?? null, loading: isLoading, error: error ?? null, saveEntry, markRead, recordMilestones, refresh: mutate };
}

/** The jobs whose time has passed and which need this tab to run them. */
export function overdueInBrowser(schedules: ScheduleView[], now = new Date()): JobKey[] {
  return schedules
    .filter((entry) => entry.enabled && entry.cadence !== "off" && !JOBS[entry.job].runsHeadless)
    .filter((entry) => entry.nextRunAt !== null && Date.parse(entry.nextRunAt) <= now.getTime())
    .map((entry) => entry.job);
}

export const CADENCE_LABELS: { key: Cadence; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "fortnightly", label: "Fortnightly" },
  { key: "monthly", label: "Monthly" },
];
