"use client";

import { useRef, useState } from "react";

/**
 * Join the website builder's waitlist. Stored through the same enquiry path as a
 * call request, tagged so the inbox shows it as a waitlist entry rather than
 * someone expecting a call.
 */
export function Waitlist() {
  const opened = useRef(Date.now());
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          services: ["websites"],
          message: "Waitlist: Thymelab website builder",
          source: "thymelab/website waitlist",
          trap: form.get("company_url"),
          openedAt: opened.current,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "That didn't send. Please try again.");
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "That didn't send. Please try again.");
    }
  }

  if (state === "done") {
    return <p className="lab-card" role="status">You&rsquo;re on the list. We&rsquo;ll email you when the website builder opens, and only then.</p>;
  }

  return (
    <form className="lab-card lab-waitlist" onSubmit={submit}>
      <div className="lab-waitlist-row">
        <input name="name" type="text" placeholder="Your name" autoComplete="name" required aria-label="Your name" />
        <input name="email" type="email" placeholder="you@yourbusiness.com" autoComplete="email" required aria-label="Email" />
        <button type="submit" className="lab-btn" disabled={state === "sending"}>
          {state === "sending" ? "Adding you" : "Tell me when it opens"}
        </button>
      </div>
      <div className="trap" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <input name="company_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {message ? <p className="small" style={{ color: "var(--bad)", margin: "0.6rem 0 0" }} role="alert">{message}</p> : null}
      <p className="lab-muted small" style={{ margin: "0.6rem 0 0" }}>One email when it opens. Nothing else.</p>
    </form>
  );
}
