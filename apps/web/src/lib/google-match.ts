"use client";

/**
 * Choose the right property without asking, when the answer is not in doubt.
 *
 * A Google account that owns five Search Console properties still owns only
 * one for this site's domain, and asking the person to find it in a list is a
 * question we can answer ourselves. So every Google connection with no
 * property chosen is matched against the site's address: a domain property
 * beats a URL-prefix one, an Analytics web stream pointing at the domain beats
 * a property that merely has the name. When two match equally well, or none
 * does, nothing is guessed, and the connection is handed back as ambiguous for
 * the person to pick on the chooser.
 */

import { useEffect, useRef, useState } from "react";

import { ga4Match, gscMatch, pickBest } from "@/engine/google-data";
import { post, type Connection } from "@/lib/session";

type GscProperty = { siteUrl: string; permissionLevel: string };
type Ga4Property = { propertyId: string; displayName: string; account: string; urls?: string[] };

export function needsProperty(connection: Connection): boolean {
  if (connection.status !== "connected") return false;
  if (connection.provider === "gsc") return typeof connection.selection?.property !== "string";
  if (connection.provider === "ga4") return typeof connection.selection?.propertyId !== "string";
  return false;
}

/** Match once per connection per visit. Returns the ones that need a person. */
export function useAutoMatch(
  siteId: string | undefined,
  siteUrl: string | undefined,
  connections: Connection[],
  refresh: () => void,
): { matching: boolean; ambiguous: string[] } {
  const tried = useRef(new Set<string>());
  const [matching, setMatching] = useState(false);
  const [ambiguous, setAmbiguous] = useState<string[]>([]);

  useEffect(() => {
    if (!siteId || !siteUrl) return;
    const todo = connections.filter((c) => needsProperty(c) && !tried.current.has(c.id));
    if (!todo.length) return;
    todo.forEach((c) => tried.current.add(c.id));
    setMatching(true);
    void (async () => {
      let changed = false;
      const unresolved: string[] = [];
      for (const connection of todo) {
        try {
          const response = await fetch(`/api/connections/${encodeURIComponent(connection.id)}/properties`, { credentials: "same-origin" });
          if (!response.ok) {
            unresolved.push(connection.id);
            continue;
          }
          const body = (await response.json()) as { properties?: (GscProperty | Ga4Property)[] };
          const list = body.properties ?? [];
          let selection: Record<string, string> | null = null;
          if (connection.provider === "gsc") {
            const best = pickBest(list as GscProperty[], (p) => gscMatch(siteUrl, p.siteUrl));
            if (best) selection = { property: best.siteUrl, permission: best.permissionLevel };
          } else {
            const best = pickBest(list as Ga4Property[], (p) => ga4Match(siteUrl, { displayName: p.displayName, urls: p.urls ?? [] }));
            if (best) selection = { propertyId: best.propertyId, name: best.displayName };
          }
          if (!selection) {
            unresolved.push(connection.id);
            continue;
          }
          await post(`/api/connections/${encodeURIComponent(connection.id)}/properties`, { selection, siteId });
          changed = true;
        } catch {
          unresolved.push(connection.id);
        }
      }
      setAmbiguous((prev) => [...new Set([...prev, ...unresolved])]);
      setMatching(false);
      if (changed) refresh();
    })();
  }, [siteId, siteUrl, connections, refresh]);

  return { matching, ambiguous };
}
