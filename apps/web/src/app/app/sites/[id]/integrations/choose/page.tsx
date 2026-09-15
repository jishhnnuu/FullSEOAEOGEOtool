"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";

import { post } from "@/lib/session";
import { Card, Notice, PageHeader } from "@/components/ui";

/**
 * Pick the property.
 *
 * Granting access and choosing which property to read are two different
 * decisions, and a Google account often owns several. This screen exists only
 * when there is more than one; a single property is selected at the callback,
 * because making someone choose from a list of one is a screen with no reason
 * to exist.
 */
export default function ChoosePropertyPage() {
  return (
    <Suspense fallback={null}>
      <Choose />
    </Suspense>
  );
}

type GscProperty = { siteUrl: string; permissionLevel: string };
type Ga4Property = { propertyId: string; displayName: string; account: string };

function Choose() {
  const params = useSearchParams();
  const route = useParams<{ id: string }>();
  const router = useRouter();
  const connectionId = params.get("connection");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<(GscProperty | Ga4Property)[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    let live = true;
    (async () => {
      try {
        const response = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/properties`, {
          credentials: "same-origin",
        });
        const body = (await response.json()) as { properties?: (GscProperty | Ga4Property)[]; message?: string };
        if (!live) return;
        if (!response.ok) throw new Error(body.message ?? "That list could not be read.");
        setProperties(body.properties ?? []);
      } catch (failure) {
        if (live) setError(failure instanceof Error ? failure.message : "That list could not be read.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [connectionId]);

  async function choose(selection: Record<string, unknown>, label: string) {
    if (!connectionId) return;
    setSaving(label);
    try {
      await post(`/api/connections/${encodeURIComponent(connectionId)}/properties`, { selection, siteId: route.id });
      router.push(`/app/sites/${route.id}/integrations?connected=1`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be saved.");
      setSaving(null);
    }
  }

  if (!connectionId) {
    return <Notice kind="error" title="Nothing to choose for">This screen needs a connection to pick a property on.</Notice>;
  }

  return (
    <div className="stack">
      <PageHeader
        title="Choose a property"
        description="Only properties this Google account can already see. Nothing is created or verified on your behalf."
      />
      {error ? <Notice kind="error" title="That did not work">{error}</Notice> : null}
      {loading ? (
        <Card><span className="spinner" /></Card>
      ) : properties.length === 0 ? (
        <Notice kind="warn" title="This account owns no properties we can read">
          The grant worked, but the Google account has no property attached to it. Add the site in Search
          Console or Analytics first, then come back.
        </Notice>
      ) : (
        <Card>
          {properties.map((property) => {
            const isGsc = "siteUrl" in property;
            const label = isGsc ? property.siteUrl : property.displayName;
            const selection = isGsc
              ? { property: property.siteUrl, permission: property.permissionLevel }
              : { propertyId: property.propertyId, name: property.displayName };
            return (
              <div key={label} className="connection-row">
                <div className="meta">
                  <strong>{label}</strong>
                  <span className="muted small">
                    {isGsc ? property.permissionLevel : `${property.account} · ${property.propertyId}`}
                  </span>
                </div>
                <button className="small primary" disabled={saving !== null} onClick={() => void choose(selection, label)}>
                  {saving === label ? "Saving" : "Use this one"}
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
