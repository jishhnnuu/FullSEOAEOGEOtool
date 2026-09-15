"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { useSession } from "@/lib/session";
import { Card, Notice, useMounted } from "@/components/ui";

/**
 * Sign in.
 *
 * Google first, because identity and connecting Search Console are then the
 * same handshake: sign in once, and "Connect Search Console" later is a single
 * Approve on an account already chosen rather than a second login. The magic
 * link is the fallback for people who will not use a Google account, and it
 * only appears when this deployment can actually send mail.
 *
 * When there is no server at all the screen says so plainly and points at the
 * thing that still works, which is the audit. Nothing here pretends.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<div className="auth-shell"><span className="spinner" /></div>}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const params = useSearchParams();
  const { session, loading } = useSession();
  const mounted = useMounted();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = params.get("next") ?? "/app";
  const serverError = params.get("error");
  const serverFix = params.get("fix");

  if (!mounted || loading) return <div className="auth-shell"><span className="spinner" /></div>;

  const { user, methods, server, gaps } = session;

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const response = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const body = (await response.json()) as { message?: string; code?: string };
      if (!response.ok) throw new Error(body.message ?? "That did not send.");
      setSent(body.message ?? "Check your inbox.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-shell">
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <Link href="/" className="wordmark" style={{ justifyContent: "center", marginBottom: "1.4rem" }}>
          <span className="dot" aria-hidden="true" />
          SEO OS
        </Link>

        {serverError ? <Notice kind="error" title="That did not work">{serverError}{serverFix ? ` ${serverFix}` : ""}</Notice> : null}

        {user ? (
          <Card className="auth-card">
            <h1>Already signed in</h1>
            <p className="muted small">
              As {user.email}, under {user.org.name}.
            </p>
            <div className="button-row" style={{ marginTop: "1.2rem" }}>
              <Link href={next} className="button primary">Continue</Link>
              <Link href="/app/settings" className="button">Settings</Link>
            </div>
          </Card>
        ) : server === "absent" ? (
          <Card className="auth-card">
            <h1>Accounts are not switched on here</h1>
            <p className="muted small">
              This deployment has no database behind it, so there is nothing to sign in to. The audit does not
              need one: type a URL and it runs in this browser, and the workspace stays here.
            </p>
            {gaps.length > 0 ? (
              <div style={{ marginTop: "1rem" }}>
                {gaps.map((gap) => (
                  <Notice key={gap.capability} kind="warn" title={gap.reason}>{gap.fix}</Notice>
                ))}
              </div>
            ) : null}
            <div className="button-row" style={{ marginTop: "1.2rem" }}>
              <Link href="/app" className="button primary">Open the workspace</Link>
              <Link href="/app/setup" className="button">What is missing</Link>
            </div>
          </Card>
        ) : server === "schema_missing" ? (
          <Card className="auth-card">
            <h1>The tables are still being built</h1>
            <p className="muted small">
              A database is bound to this Worker and the schema applies itself on the next request. Reload in a
              moment. If this screen persists, something is refusing the write.
            </p>
            <div className="button-row" style={{ marginTop: "1.2rem" }}>
              <Link href="/app/setup" className="button primary">Check the setup</Link>
            </div>
          </Card>
        ) : (
          <Card className="auth-card">
            <h1>Sign in</h1>
            <p className="muted small">
              Whatever you have already audited in this browser comes with you. Nothing re-crawls.
            </p>

            {methods.google ? (
              <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="button primary google-button" style={{ marginTop: "1.2rem", width: "100%" }}>
                <GoogleMark />
                Continue with Google
              </a>
            ) : (
              <Notice kind="warn" title="Google sign-in is not configured on this deployment">
                {gaps.find((gap) => gap.capability === "google")?.fix ?? "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Worker secrets."}{" "}
                <Link href="/app/setup">The setup screen lists every value.</Link>
              </Notice>
            )}

            {methods.google ? (
              <p className="muted small" style={{ marginTop: "0.7rem" }}>
                This asks for your name and email and nothing else. Search Console and Analytics are asked for
                later, on the screen that can say why it wants them.
              </p>
            ) : null}

            {methods.email ? (
              <>
                <div className="rule-label"><span>or</span></div>
                {sent ? (
                  <Notice kind="ok" title="Link sent">{sent}</Notice>
                ) : (
                  <form onSubmit={sendLink}>
                    <div className="field">
                      <label htmlFor="email">Email</label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        required
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@company.com"
                      />
                    </div>
                    {error ? <Notice kind="error" title="That did not send">{error}</Notice> : null}
                    <button type="submit" className="button" disabled={sending} style={{ width: "100%", marginTop: "0.8rem" }}>
                      {sending ? "Sending" : "Email me a link"}
                    </button>
                  </form>
                )}
              </>
            ) : null}

            <p className="muted small" style={{ marginTop: "1.4rem" }}>
              No password, ever. <Link href="/security">What we hold and what we do not</Link>.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Google's mark, drawn rather than fetched, so the button works offline. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.9-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
