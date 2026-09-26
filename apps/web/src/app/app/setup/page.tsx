"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
 * Switching on Google for this deployment is two accounts' worth of clicks:
 * one OAuth client in Google Cloud, and three secrets on the Worker. Nothing
 * needs a terminal. The database creates itself on deploy, the tables build
 * themselves on the first request, the master key is generated on this page,
 * and the values that are easy to get wrong (the redirect URLs and scopes) are
 * printed with copy buttons rather than described.
 *
 * It is deliberately reachable without signing in. The person who has to fix a
 * gap is, by definition, standing outside one.
 */
export default function SetupPage() {
  const { data, isLoading } = useSWR<Setup>("/api/setup", async (url: string) => {
    const response = await fetch(url);
    return (await response.json()) as Setup;
  }, { refreshInterval: 15_000 });

  // Generated here, in this browser, and never sent anywhere: the only copy
  // is the one pasted into Cloudflare.
  const [masterKey, setMasterKey] = useState("");
  useEffect(() => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setMasterKey(btoa(String.fromCharCode(...bytes)));
  }, []);

  if (isLoading || !data) {
    return (
      <div className="auth-shell">
        <span className="spinner" />
      </div>
    );
  }

  const required = data.steps.filter((s) => !s.optional);
  const outstanding = required.filter((s) => !s.done);
  const done = (key: string) => data.steps.find((s) => s.key === key)?.done ?? false;
  const allScopes = [...data.scopes.identity, ...data.scopes.searchConsole, ...data.scopes.analytics];

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "2rem 1rem" }} className="stack">
      <PageHeader
        title="Switch on Google"
        description="About fifteen minutes, once, in a browser. After this, connecting Search Console and Analytics is one button for everyone. This page re-checks itself every fifteen seconds."
      />

      {data.ready ? (
        <Notice kind="ok" title="Everything required is in place">
          Sign-in works, and so does Connect Google. Open a site, go to Connections, and press Connect Google.{" "}
          <Link href="/app">Go to your sites</Link>.
        </Notice>
      ) : (
        <Notice kind="warn" title={`${outstanding.length} of ${required.length} still to do`}>
          The audit works regardless. These are what sign-in and Connect Google need.
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

      <Card title={`1. In Google Cloud: make the OAuth client${done("google_client") ? " (done)" : ""}`}>
        <ol className="small" style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.7rem" }}>
          <li>
            <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">Create a project</a>.
            Any name. Sign in with the Google account you want to own this app.
          </li>
          <li>
            Turn on the three APIs, pressing Enable on each:{" "}
            <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noopener noreferrer">Search Console API</a>,{" "}
            <a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noopener noreferrer">Analytics Data API</a>,{" "}
            <a href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com" target="_blank" rel="noopener noreferrer">Analytics Admin API</a>.
            A scope granted against an API nobody enabled fails at the first call, not at the consent screen.
          </li>
          <li>
            Open the{" "}
            <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener noreferrer">Google Auth Platform</a>{" "}
            and press Get started. App name: your brand. Support email: yours. Audience: <strong>External</strong>. Contact
            email: yours. Agree, and Create.
          </li>
          <li>
            Under{" "}
            <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noopener noreferrer">Audience</a>, leave the
            status on <strong>Testing</strong> and add every Gmail that will connect under <strong>Test users</strong>, including
            the one that owns your Search Console. Up to 100.
          </li>
          <li>
            Under{" "}
            <a href="https://console.cloud.google.com/auth/scopes" target="_blank" rel="noopener noreferrer">Data access</a>, Add
            or remove scopes, and paste these into &ldquo;Manually add scopes&rdquo;:
            <div className="connection-row" style={{ marginTop: "0.4rem" }}>
              <div className="meta">
                <span className="mono tiny" style={{ wordBreak: "break-all" }}>{allScopes.join(", ")}</span>
              </div>
              <CopyButton text={allScopes.join(",")} />
            </div>
          </li>
          <li>
            Under{" "}
            <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Clients</a>, Create
            client. Type: <strong>Web application</strong>. Under Authorised redirect URIs, add both of these, exactly:
            {data.redirectUris.map((uri) => (
              <div key={uri} className="connection-row" style={{ marginTop: "0.4rem" }}>
                <div className="meta">
                  <span className="mono small" style={{ wordBreak: "break-all" }}>{uri}</span>
                </div>
                <CopyButton text={uri} />
              </div>
            ))}
          </li>
          <li>
            Create. Google shows a <strong>Client ID</strong> and a <strong>Client secret</strong>. Keep that tab open for the
            next step. The secret is shown in full only once, so copy it now.
          </li>
        </ol>
      </Card>

      <Card title={`2. In Cloudflare: add three secrets${done("master_key") && done("google_client") ? " (done)" : ""}`}>
        <p className="small">
          <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noopener noreferrer">
            Workers and Pages
          </a>
          , this Worker, Settings, Variables and Secrets, Add. Choose type <strong>Secret</strong> for each, then Deploy.
          Secrets survive every future deploy, so this is once.
        </p>
        <div className="connection-row">
          <div className="meta">
            <strong className="mono small">GOOGLE_CLIENT_ID</strong>
            <span className="muted small">The Client ID from the last step. It ends in .apps.googleusercontent.com.</span>
          </div>
        </div>
        <div className="connection-row">
          <div className="meta">
            <strong className="mono small">GOOGLE_CLIENT_SECRET</strong>
            <span className="muted small">The Client secret from the same screen.</span>
          </div>
        </div>
        <div className="connection-row">
          <div className="meta">
            <strong className="mono small">SEOOS_MASTER_KEY</strong>
            {done("master_key") ? (
              <span className="muted small">Already set. Do not change it: every stored connection is sealed with it.</span>
            ) : (
              <>
                <span className="muted small">
                  This one was just made in your browser, from 32 random bytes. It is not sent anywhere, so the copy you
                  paste into Cloudflare is the only one.
                </span>
                <span className="mono small" style={{ wordBreak: "break-all" }}>{masterKey}</span>
              </>
            )}
          </div>
          {!done("master_key") && masterKey ? <CopyButton text={masterKey} /> : null}
        </div>
        <p className="small muted" style={{ marginTop: "0.6rem" }}>
          Changing the master key later disconnects every stored connection, because nothing sealed with the old key
          can be opened with the new one. People would simply press Connect Google again.
        </p>
      </Card>

      <Card title="Optional: book-a-call enquiries">
        <p className="small">
          The <Link href="/book">book a call</Link> form stores every enquiry already. These three decide who sees them and
          how. Add each as a <strong>Variable</strong> (not a secret) in the same place as the secrets above.
        </p>
        <ul className="small">
          <li>
            <strong className="mono">OWNER_EMAILS</strong>: the addresses you sign in with, separated by commas. Those
            people can read <Link href="/app/enquiries">the enquiries inbox</Link>.
          </li>
          <li>
            <strong className="mono">CONTACT_EMAIL</strong>: where each enquiry is emailed. Replying answers the person
            directly. Needs <span className="mono">RESEND_API_KEY</span> as well.
          </li>
          <li>
            <strong className="mono">BOOKING_URL</strong>: your Calendly or Cal.com page. People can pick a time as soon
            as they send the form, with their name and email filled in.
          </li>
        </ul>
      </Card>

      <Card title="3. Try it">
        <p className="small">
          Once the status above is all ticks: open a site, go to <strong>Connections</strong>, and press{" "}
          <strong>Connect Google</strong>. Google asks which account to use; pick one listed as a test user. It warns that
          the app is unverified, because it is still in Testing: press Continue. Leave both boxes ticked. You land on{" "}
          <strong>Your Google data</strong> with the sync running.
        </p>
      </Card>

      <details className="acc">
        <summary>What Testing mode means, and going public later</summary>
        <div className="acc-body">
          <p className="small">
            <strong>Works on this address today.</strong> No domain is needed to test. Only the Gmail addresses listed as
            test users can connect, and Google keeps each of their permissions for seven days while the app is in
            Testing; after that the screen says the connection needs renewing, and Connect Google renews it.
          </p>
          <p className="small">
            <strong>To open it to everyone</strong>, press Publish app under Audience. Google then verifies the app because
            Analytics read access is a sensitive scope: it wants the app&apos;s home page and privacy policy on a domain you
            own and have verified, which is why this waits until the real domain is live. Neither scope is a restricted
            one, so there is no paid security assessment.
          </p>
          <p className="small">
            <strong>After moving to a real domain</strong>, add the two redirect URLs this page shows then (they follow the
            address automatically) to the same client.
          </p>
        </div>
      </details>

      <details className="acc">
        <summary>If the database still shows missing after a deploy</summary>
        <div className="acc-body">
          <p className="small">
            Deploys normally create a D1 database called <span className="mono">seoos</span> and attach it. If the
            deploy was not allowed to create one, make it by hand: Cloudflare dashboard, Storage and Databases, D1, Create,
            name it <span className="mono">seoos</span>. The next deploy finds it by name. There is no id to paste and no
            command to run; the tables build themselves.
          </p>
        </div>
      </details>

      <Card title="What this deployment is">
        <p className="small muted">
          Origin: <span className="mono">{data.origin}</span>. Everything above is configuration held by Cloudflare and
          Google, not by any machine or any assistant. Once it is set, the product is a website: usable by anyone, from any
          device, with nothing installed.
        </p>
      </Card>
    </div>
  );
}
