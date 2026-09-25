/**
 * Turn a Google grant into stored connections.
 *
 * Both ways into Google end here: connecting while signed in, and connecting
 * while signed out, where the same trip to Google also signs the person in.
 * One grant can cover Search Console and Analytics at once, so it is stored
 * as one connection per product the person actually ticked, each sealing its
 * own copy of the refresh token.
 *
 * If exactly one property is visible it is selected here, because making
 * someone pick from a list of one is a screen that exists for no reason. More
 * than one, and the integrations screen matches them against the site's own
 * address before asking.
 */

import type { Env } from "./env";
import { GoogleError, PRODUCT_SCOPES, type Profile, type TokenSet } from "./google";
import { getConnection, saveConnection, type Provider } from "./connections";
import { properties as gscProperties } from "./gsc";
import { properties as ga4Properties } from "./ga4";
import { nowIso, record, updateScoped } from "./db";

export type GrantResult = {
  /** Products now connected. */
  connected: Provider[];
  /** Products asked for but unticked on Google's screen. */
  declined: Provider[];
};

export async function storeGoogleGrant(
  e: Env,
  input: {
    orgId: string;
    userId: string | null;
    siteId: string | null;
    product: string;
    tokens: TokenSet;
    profile: Profile;
  },
): Promise<GrantResult> {
  const { tokens, profile } = input;
  if (!tokens.refresh_token) {
    throw new GoogleError(
      "no_refresh_token",
      "Google did not return a long-lived permission, so scheduled work could not use it. Remove this app at myaccount.google.com/permissions and connect again.",
    );
  }

  const wanted: Provider[] = input.product === "google" ? ["gsc", "ga4"] : [input.product as Provider];
  const granted = new Set((tokens.scope ?? "").split(" ").filter(Boolean));
  const connected: Provider[] = [];
  const declined: Provider[] = [];

  for (const product of wanted) {
    const spec = PRODUCT_SCOPES[product];
    if (!spec) continue;
    if (!spec.scopes.every((scope) => granted.has(scope))) {
      declined.push(product);
      continue;
    }
    const id = await saveConnection(e, {
      orgId: input.orgId,
      siteId: input.siteId,
      provider: product,
      label: profile.email,
      scopes: tokens.scope,
      secret: {
        kind: "google",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_expires: Date.now() + Math.max(0, tokens.expires_in - 30) * 1000,
      },
    });
    connected.push(product);

    // One property means no choosing screen.
    try {
      const row = await getConnection(e, id, input.orgId);
      if (!row) continue;
      if (product === "gsc") {
        const found = await gscProperties(e, row);
        if (found.length === 1) {
          await updateScoped(e, "connections", id, input.orgId, {
            selection: JSON.stringify({ property: found[0].siteUrl, permission: found[0].permissionLevel }),
            updated_at: nowIso(),
          });
        }
      } else if (product === "ga4") {
        const found = await ga4Properties(e, row, { streams: false });
        if (found.length === 1) {
          await updateScoped(e, "connections", id, input.orgId, {
            selection: JSON.stringify({ propertyId: found[0].propertyId, name: found[0].displayName }),
            updated_at: nowIso(),
          });
        }
      }
    } catch {
      // A grant that works but whose property list failed is still a grant.
      // The integrations screen asks again.
    }

    await record(e, {
      orgId: input.orgId,
      userId: input.userId,
      action: "connection.added",
      target: `${product}:${profile.email}`,
      detail: { scopes: spec.scopes },
    });
  }

  return { connected, declined };
}

/** Where to land after a grant, with what happened written into the address. */
export function landing(next: string, result: GrantResult): string {
  const safe = next.startsWith("/") ? next : "/app";
  const to = new URL(safe, "https://x.invalid");
  if (result.connected.length) to.searchParams.set("connected", result.connected.join(","));
  if (result.declined.length) to.searchParams.set("declined", result.declined.join(","));
  return `${to.pathname}${to.search}`;
}
