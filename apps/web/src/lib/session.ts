"use client";

/**
 * The account, as the browser sees it.
 *
 * Every screen reads this on mount, including when there is no server at all:
 * the answer then is a signed-out state with a stated reason, which is what
 * lets the sign-in screen explain itself instead of spinning. Nothing here
 * blocks the engine, because the engine does not need an account to run.
 */

import useSWR from "swr";

export type Gap = { capability: string; reason: string; fix: string };

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  org: { id: string; name: string; plan: string };
  role: string;
};

export type SessionState = {
  user: SessionUser | null;
  methods: { google: boolean; email: boolean };
  /** "ready" when accounts work, "schema_missing" when the database is bound but empty, "absent" when there is none. */
  server: "ready" | "schema_missing" | "absent";
  gaps: Gap[];
};

const SIGNED_OUT: SessionState = {
  user: null,
  methods: { google: false, email: false },
  server: "absent",
  gaps: [],
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

export function useSession(): { session: SessionState; loading: boolean; refresh: () => void } {
  const { data, isLoading, mutate } = useSWR<SessionState>("/api/auth/session", fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { session: data ?? SIGNED_OUT, loading: isLoading, refresh: () => void mutate() };
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
  window.location.href = "/";
}

/** Where a screen sends someone who has to sign in before it can continue. */
export function signInHref(next?: string): string {
  const to = next ?? (typeof window !== "undefined" ? window.location.pathname : "/app");
  return `/app/signin?next=${encodeURIComponent(to)}`;
}

/* -------------------------------------------------------------- server IO */

export type Connection = {
  id: string;
  provider: string;
  label: string;
  status: string;
  scopes: string[];
  selection: Record<string, unknown> | null;
  siteId: string | null;
  lastError: string | null;
  connectedAt: string;
  expiresAt: string | null;
};

export function useConnections(enabled: boolean): {
  connections: Connection[];
  loading: boolean;
  refresh: () => void;
} {
  const { data, isLoading, mutate } = useSWR<{ connections: Connection[] }>(
    enabled ? "/api/connections" : null,
    fetchJson,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return { connections: data?.connections ?? [], loading: isLoading, refresh: () => void mutate() };
}

export async function disconnect(id: string): Promise<void> {
  await fetch(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
}

export type ApiFailure = { code: string; message: string; fix?: string };

/** POST that surfaces the server's own sentence rather than a status code. */
export async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T & Partial<ApiFailure>) : ({} as T);
  if (!response.ok) {
    const failure = parsed as ApiFailure;
    const error = new Error(failure.message ?? `${url} answered ${response.status}`);
    (error as Error & { code?: string; fix?: string }).code = failure.code;
    (error as Error & { code?: string; fix?: string }).fix = failure.fix;
    throw error;
  }
  return parsed as T;
}
