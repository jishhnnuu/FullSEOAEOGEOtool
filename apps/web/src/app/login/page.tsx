"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { Card } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", org_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "login"
          ? { email: form.email, password: form.password }
          : form;
      const res = await api.post<{ access_token: string }>(`/auth/${mode}`, body);
      setToken(res.access_token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <h1>{mode === "login" ? "Sign in" : "Create an account"}</h1>
        <p className="muted small">
          {mode === "login"
            ? "Your search programme is waiting."
            : "Connect a site and get a real audit before you configure anything."}
        </p>

        <form onSubmit={submit} style={{ marginTop: "1.25rem" }}>
          {mode === "signup" && (
            <>
              <div className="field">
                <label htmlFor="org">Company</label>
                <input id="org" value={form.org_name} onChange={set("org_name")} required
                       placeholder="Acme Dental" />
              </div>
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input id="name" value={form.name} onChange={set("name")} placeholder="Jo Bloggs" />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={set("email")}
                   required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={form.password} onChange={set("password")}
                   required minLength={mode === "signup" ? 10 : undefined}
                   autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {mode === "signup" && (
              <div className="help">At least 10 characters. Length beats punctuation.</div>
            )}
          </div>

          {error && <div className="notice notice-bad" style={{ marginBottom: "0.85rem" }}>{error}</div>}

          <button className="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button className="small" style={{ border: "none", background: "none", padding: 0, color: "var(--accent)" }}
                  onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}>
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </Card>
    </div>
  );
}
