"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { importWorkspace, update } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { Card, Notice, useMounted } from "@/components/ui";

/**
 * Sign in.
 *
 * On the hosted app the workspace lives in this browser, so there is no
 * password to check and pretending otherwise would be theatre. This screen
 * names the account, or restores one from an export. A self-hosted install
 * with the API behind it authenticates properly, against its own database.
 */
export default function SignInPage() {
  const router = useRouter();
  const [workspace] = useWorkspace();
  const mounted = useMounted();
  const [form, setForm] = useState({ email: "", name: "", company: "" });
  const [error, setError] = useState<string | null>(null);

  if (!mounted) return <div className="auth-shell"><span className="spinner" /></div>;

  const hasWorkspace = workspace.sites.length > 0;

  return (
    <div className="auth-shell">
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <Link href="/" className="wordmark" style={{ justifyContent: "center", marginBottom: "1.4rem" }}>
          <span className="dot" aria-hidden="true" />
          SEO OS
        </Link>

        {hasWorkspace ? (
          <Card className="auth-card">
            <h1>Welcome back</h1>
            <p className="muted small">
              {workspace.sites.length} site{workspace.sites.length === 1 ? "" : "s"} in this browser
              {workspace.account?.company ? `, under ${workspace.account.company}` : ""}.
            </p>
            <div className="button-row" style={{ marginTop: "1.2rem" }}>
              <Link href="/app" className="button primary">Open the dashboard</Link>
              <Link href="/app/new" className="button">Add another site</Link>
            </div>
          </Card>
        ) : (
          <Card className="auth-card">
            <h1>Start a workspace</h1>
            <p className="muted small">
              No password, because there is nothing on our side to unlock. Your workspace is held in this browser
              and travels by export, not by login.
            </p>

            <div className="field" style={{ marginTop: "1.2rem" }}>
              <label htmlFor="company">Company</label>
              <input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Dental" />
            </div>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jo Bloggs" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jo@acme.com" />
              <div className="help">Kept in this browser. Used on reports, sent nowhere.</div>
            </div>

            {error && <Notice kind="bad">{error}</Notice>}

            <button
              className="primary"
              style={{ width: "100%", justifyContent: "center", marginTop: "0.4rem" }}
              onClick={() => {
                update((w) => {
                  w.account = {
                    email: form.email.trim(),
                    name: form.name.trim(),
                    company: form.company.trim() || "My company",
                    plan: "trial",
                    createdAt: new Date().toISOString(),
                  };
                });
                router.push("/app/new");
              }}
            >
              Create the workspace
            </button>

            <hr />

            <label htmlFor="restore">Restoring from an export?</label>
            <input
              id="restore"
              type="file"
              accept="application/json,.json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  importWorkspace(await file.text());
                  router.push("/app");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "That file could not be read.");
                }
              }}
            />
            <div className="help">A workspace JSON file from Settings, Export.</div>
          </Card>
        )}

        <p className="small muted center" style={{ marginTop: "1.2rem" }}>
          <Link href="/app/new">Or skip this and audit a site now</Link>
        </p>
      </div>
    </div>
  );
}
