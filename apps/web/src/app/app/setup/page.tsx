"use client";

import Link from "next/link";
import useSWR from "swr";

import { Card, CopyButton, Notice, PageHeader } from "@/components/ui";

type Step = { key: string; name: string; done: boolean; optional?: boolean; detail: string; where: string };

type Setup = {
  origin: string;
  steps: Step[];
  redirectUris: string[];
  scopes: Record<string, string[]>;
  apis: string[];
  ready: boolean;
};

/**
 * Setup, readable from any browser on any device.
 *
 * Provisioning this product is four things, and not one of them needs a
 * terminal. The database builds its own tables, the secrets are fields in the
 * Cloudflare dashboard, and the only value that is hard to get right, the pair
 * of redirect URLs, is printed here with a copy button rather than described.
 *
 * It is deliberately reachable without signing in. The person who has to fix a
 * gap is, by definition, standing outside one.
 */
export default function SetupPage() {
  const { data, isLoading } = useSWR<Setup>("/api/setup", async (url: string) => {
    const response = await fetch(url);
    return (await response.json()) as Setup;
  }, { refreshInterval: 15_000 });

  if (isLoading || !data) {
    return (
      <div className="auth-shell">
        <span className="spinner" />
      </div>
    );
  }

  const required = data.steps.filter((s) => !s.optional);
  const outstanding = required.filter((s) => !s.done);

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "2rem 1rem" }}>
      <PageHeader
        title="Setup"
        description="Four things, none of which needs a command line. This screen re-checks itself every fifteen seconds."
      />

      {data.ready ? (
        <Notice kind="ok" title="Everything required is in place">
          Sign-in works, and so does connecting Search Console and Analytics.{" "}
          <Link href="/app/signin">Go and sign in</Link>.
        </Notice>
      ) : (
        <Notice kind="warn" title={`${outstanding.length} of ${required.length} still to do`}>
          The audit works regardless. These are what accounts and connections need.
        </Notice>
      )}

      <Card title="Status">
        {data.steps.map((step) => (
          <div key={step.key} className="connection-row">
            <div className="meta">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span aria-hidden="true">{step.done ? "✓" : step.optional ? "○" : "✗"}</span>
                <strong>{step.name}</strong>
                {step.optional ? <span className="muted small">optional</span> : null}
              </div>
              <span className="muted small">{step.detail}</span>
              <span className="tiny faint">{step.where}</span>
            </div>
          </div>
        ))}
      </Card>

      <Card title="The two redirect URLs">
        <p className="small muted">
          Paste both into the Google OAuth client, under Authorised redirect URIs. Two rather than one on
          purpose: signing in and connecting a product are separate round trips, which means a callback for one
          cannot be replayed against the other.
        </p>
        {data.redirectUris.map((uri) => (
          <div key={uri} className="connection-row">
            <div className="meta">
              <span className="mono small" style={{ wordBreak: "break-all" }}>{uri}</span>
            </div>
            <CopyButton text={uri} />
          </div>
        ))}
      </Card>

      <Card title="Scopes to add on the consent screen">
        <div className="connection-row">
          <div className="meta">
            <strong>Identity</strong>
            <span className="mono tiny">{data.scopes.identity.join("  ")}</span>
            <span className="muted small">No review. This is all sign-in needs.</span>
          </div>
        </div>
        <div className="connection-row">
          <div className="meta">
            <strong>Search Console</strong>
            <span className="mono tiny" style={{ wordBreak: "break-all" }}>{data.scopes.searchConsole.join(" ")}</span>
            <span className="muted small">
              No review either. Google reclassified this one as non-sensitive in 2024, so it works for anyone
              the day the client exists.
            </span>
          </div>
        </div>
        <div className="connection-row">
          <div className="meta">
            <strong>Analytics</strong>
            <span className="mono tiny" style={{ wordBreak: "break-all" }}>{data.scopes.analytics.join(" ")}</span>
            <span className="muted small">
              Sensitive. Works today for any address listed under Test users, and needs Google&apos;s review
              before it works for the public. That review takes weeks, so it is worth starting early.
            </span>
          </div>
        </div>
        <div className="connection-row">
          <div className="meta">
            <strong>Business Profile</strong>
            <span className="mono tiny" style={{ wordBreak: "break-all" }}>{data.scopes.businessProfile.join(" ")}</span>
            <span className="muted small">
              Sensitive, and Google gates the API itself behind a separate access request. Until that clears,
              posts and review replies are drafted here and pasted there.
            </span>
          </div>
        </div>
      </Card>

      <Card title="APIs to enable">
        <p className="small muted">
          In the same Google Cloud project, under APIs and Services, Library. A scope that is granted against an
          API nobody enabled fails at the first call rather than at the consent screen, which is a confusing way
          to find out.
        </p>
        <ul className="small">
          {data.apis.map((api) => (
            <li key={api}>{api}</li>
          ))}
        </ul>
      </Card>

      <Card title="What this deployment is">
        <p className="small muted">
          Origin: <span className="mono">{data.origin}</span>. Everything above is configuration held by
          Cloudflare and Google, not by any machine. Once it is set, the product is a website: usable by anyone,
          from any device, anywhere, with nothing installed.
        </p>
      </Card>
    </div>
  );
}
