"use client";

/**
 * Where the synced Google data lives: IndexedDB, in this browser.
 *
 * `localStorage` holds about five megabytes and a full Search Console pull is
 * often more than that, so reports go to IndexedDB, which holds as much as the
 * disk allows. The Worker never keeps a copy. Its job is the handshake and the
 * token, and the data stays on the machine of the person it belongs to, which
 * is the same arrangement as the audit.
 *
 * Every call fails quietly. A private window can refuse IndexedDB outright,
 * and then the sync still runs and the screen still renders from memory; it
 * simply has to run again next visit, and the screen says so.
 */

import type { StoredReport } from "@/engine/google-data";

const DB_NAME = "seoos-google";
const VERSION = 1;

export type SyncMeta = {
  siteId: string;
  syncedAt: string;
  /** The Search Console property and Analytics property the data came from. */
  gscProperty: string | null;
  ga4Property: string | null;
  ga4Name: string | null;
  /** The newest day Search Console had final data for, at sync time. */
  gscNewest: string | null;
  errors: string[];
  /** Seconds the sync took, so a slow one is visible rather than suspected. */
  seconds: number;
};

let opening: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, StoredReport>();
const memoryMeta = new Map<string, SyncMeta>();

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("reports")) {
          const store = db.createObjectStore("reports", { keyPath: "id" });
          store.createIndex("site", "siteId");
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "siteId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function done<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function reportId(siteId: string, provider: string, key: string): string {
  return `${siteId}:${provider}:${key}`;
}

/** Whether reports will outlive this tab. */
export async function persistent(): Promise<boolean> {
  return (await open()) !== null;
}

export async function saveReport(siteId: string, report: StoredReport): Promise<void> {
  const id = reportId(siteId, report.provider, report.key);
  memory.set(id, report);
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction("reports", "readwrite");
    await done(tx.objectStore("reports").put({ id, siteId, ...report }));
  } catch {
    // Quota or a closed database: the in-memory copy still renders.
  }
}

export async function loadReports(siteId: string): Promise<StoredReport[]> {
  const db = await open();
  if (db) {
    try {
      const tx = db.transaction("reports", "readonly");
      const rows = (await done(tx.objectStore("reports").index("site").getAll(siteId))) as (StoredReport & { id: string; siteId: string })[] | null;
      if (rows) {
        return rows.map(({ id: _id, siteId: _site, ...report }) => report as StoredReport);
      }
    } catch {
      // Fall through to memory.
    }
  }
  return [...memory.entries()].filter(([id]) => id.startsWith(`${siteId}:`)).map(([, report]) => report);
}

export async function saveMeta(meta: SyncMeta): Promise<void> {
  memoryMeta.set(meta.siteId, meta);
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction("meta", "readwrite");
    await done(tx.objectStore("meta").put(meta));
  } catch {
    // As above.
  }
}

export async function loadMeta(siteId: string): Promise<SyncMeta | null> {
  const db = await open();
  if (db) {
    try {
      const tx = db.transaction("meta", "readonly");
      const found = (await done(tx.objectStore("meta").get(siteId))) as SyncMeta | null | undefined;
      if (found) return found;
    } catch {
      // As above.
    }
  }
  return memoryMeta.get(siteId) ?? null;
}

/** Remove a site's synced data, for when Google is disconnected. */
export async function forgetSite(siteId: string): Promise<void> {
  for (const id of [...memory.keys()]) if (id.startsWith(`${siteId}:`)) memory.delete(id);
  memoryMeta.delete(siteId);
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(["reports", "meta"], "readwrite");
    const keys = (await done(tx.objectStore("reports").index("site").getAllKeys(siteId))) ?? [];
    for (const key of keys) tx.objectStore("reports").delete(key);
    tx.objectStore("meta").delete(siteId);
  } catch {
    // Nothing to do.
  }
}
