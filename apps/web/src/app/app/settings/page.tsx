"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DEFAULT_MODEL_NAMES } from "@/lib/models";
import { exportWorkspace, importWorkspace, reset, update, type ModelConfig } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { Card, Notice, PageHeader, useMounted } from "@/components/ui";

const PROVIDERS: { key: ModelConfig["provider"]; label: string; keyHint: string }[] = [
  { key: "anthropic", label: "Anthropic", keyHint: "A key from console.anthropic.com, starting sk-ant-" },
  { key: "openai", label: "OpenAI", keyHint: "A key from platform.openai.com, starting sk-" },
  { key: "google", label: "Google AI Studio", keyHint: "A key from aistudio.google.com" },
  { key: "openai-compatible", label: "Any OpenAI-compatible endpoint", keyHint: "Together, Groq, OpenRouter, vLLM, Ollama behind a proxy, anything speaking the same API" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [workspace] = useWorkspace();
  const mounted = useMounted();
  const [message, setMessage] = useState<string | null>(null);
  const [model, setModel] = useState<ModelConfig>(
    workspace.model ?? { provider: "anthropic", apiKey: "", model: "", baseUrl: "" },
  );

  if (!mounted) return <div className="auth-shell"><span className="spinner" /></div>;

  const account = workspace.account;

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
      <Link href="/app" className="small muted">Back to your sites</Link>
      <PageHeader
        title="Account and settings"
        description="Everything here is held in this browser. Nothing on this screen is sent anywhere until you use it."
      />

      <div className="stack">
        <Card title="Account">
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="company">Company</label>
              <input
                id="company"
                defaultValue={account?.company ?? ""}
                onBlur={(e) => update((w) => { if (w.account) w.account.company = e.target.value; })}
              />
            </div>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                defaultValue={account?.name ?? ""}
                onBlur={(e) => update((w) => { if (w.account) w.account.name = e.target.value; })}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                defaultValue={account?.email ?? ""}
                onBlur={(e) => update((w) => { if (w.account) w.account.email = e.target.value; })}
              />
            </div>
            <div className="field">
              <label>Plan</label>
              <div className="row">
                <span className="badge badge-accent">{account?.plan ?? "trial"}</span>
                <Link href="/pricing" className="small">See what each plan includes</Link>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Model provider, for drafting">
          <p className="small muted">
            The audit, the fixes, the schema, the briefs and the link plans all run without a model. A key is only
            needed to turn a brief into finished prose. It is your key, your account and your bill: the request
            goes from this browser, through the relay, to the provider you pick, and is never stored.
          </p>

          <div className="field">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={model.provider}
              onChange={(e) => setModel({ ...model, provider: e.target.value as ModelConfig["provider"] })}
            >
              {PROVIDERS.map((provider) => (
                <option key={provider.key} value={provider.key}>{provider.label}</option>
              ))}
            </select>
            <div className="help">{PROVIDERS.find((p) => p.key === model.provider)?.keyHint}</div>
          </div>

          {model.provider === "openai-compatible" && (
            <div className="field">
              <label htmlFor="baseurl">Base URL</label>
              <input
                id="baseurl"
                value={model.baseUrl}
                onChange={(e) => setModel({ ...model, baseUrl: e.target.value })}
                placeholder="https://api.groq.com/openai/v1"
              />
              <div className="help">Must be https. The path /chat/completions is appended.</div>
            </div>
          )}

          <div className="field">
            <label htmlFor="model">Model</label>
            <input
              id="model"
              value={model.model}
              onChange={(e) => setModel({ ...model, model: e.target.value })}
              placeholder={DEFAULT_MODEL_NAMES[model.provider] || "model name"}
            />
            <div className="help">Left blank, the provider&apos;s current default is used.</div>
          </div>

          <div className="field">
            <label htmlFor="key">API key</label>
            <input
              id="key"
              type="password"
              value={model.apiKey}
              onChange={(e) => setModel({ ...model, apiKey: e.target.value })}
              placeholder="Paste your key"
            />
            <div className="help">Held in this browser&apos;s storage. Clear it here to remove it.</div>
          </div>

          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                update((w) => { w.model = model.apiKey ? model : null; });
                setMessage(model.apiKey ? "Model provider saved." : "Model provider cleared.");
              }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setModel({ provider: "anthropic", apiKey: "", model: "", baseUrl: "" });
                update((w) => { w.model = null; });
                setMessage("Model provider cleared.");
              }}
            >
              Clear the key
            </button>
          </div>
          {message && <Notice kind="ok">{message}</Notice>}
        </Card>

        <Card title="Your data">
          <p className="small muted">
            This workspace holds {workspace.sites.length} site{workspace.sites.length === 1 ? "" : "s"},{" "}
            {workspace.runs.length} run{workspace.runs.length === 1 ? "" : "s"},{" "}
            {workspace.approvals.length} approval{workspace.approvals.length === 1 ? "" : "s"} and{" "}
            {workspace.content.length} content item{workspace.content.length === 1 ? "" : "s"}. It lives in this
            browser. Export it to move to another machine, or to keep a copy.
          </p>
          <div className="button-row">
            <button
              onClick={() => {
                const blob = new Blob([exportWorkspace()], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `seo-os-workspace-${new Date().toISOString().slice(0, 10)}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export everything
            </button>
            <label className="button small" style={{ marginBottom: 0 }}>
              Import a workspace
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    importWorkspace(await file.text());
                    setMessage("Workspace restored.");
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : "That file could not be read.");
                  }
                }}
              />
            </label>
            <button
              className="danger"
              onClick={() => {
                if (!confirm("Delete every site, run, approval and draft in this browser? This cannot be undone.")) return;
                reset();
                router.push("/");
              }}
            >
              Delete everything
            </button>
          </div>
        </Card>

        <Card title="Running this yourself">
          <p className="small muted">
            The hosted app keeps your workspace in the browser because the edge runtime it is deployed on has no
            database. The same platform runs as a server installation with Postgres behind it, multiple users, and
            a worker that executes missions on a schedule instead of when a tab is open.
          </p>
          <pre className="codeblock">{`git clone https://github.com/jishhnnuu/fullseoaeogeotool
make install && make keygen
make docker`}</pre>
        </Card>
      </div>
    </div>
  );
}
