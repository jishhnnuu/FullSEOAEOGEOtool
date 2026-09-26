"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SERVICE_CHOICES, STAGES, validateEnquiry } from "@/engine/enquiry";

/**
 * The book-a-call form.
 *
 * It says exactly what happened when it is sent: stored, emailed, or both,
 * and, where the owner has set a scheduling link, it offers the calendar
 * straight away with the name and email filled in. It never says "we'll call
 * you in an hour", because nothing here can promise that.
 */
export function BookForm() {
  const openedAt = useRef(Date.now());
  const [services, setServices] = useState<string[]>([]);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ bookingUrl: string | null; name: string; email: string } | null>(null);
  const [source, setSource] = useState<string | null>(null);

  // A service page links here as /book?service=search, so the right box is
  // already ticked. Read once, in the browser.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("service");
    if (wanted && SERVICE_CHOICES.some((s) => s.key === wanted)) setServices([wanted]);
    setSource(params.get("from") ?? (document.referrer ? new URL(document.referrer).pathname : null));
  }, []);

  function toggle(key: string) {
    setServices((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      business: form.get("business"),
      website: form.get("website"),
      stage,
      services,
      message: form.get("message"),
      source,
      trap: form.get("company_url"),
      openedAt: openedAt.current,
    };
    const checked = validateEnquiry(payload);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; bookingUrl?: string | null };
      if (!response.ok) throw new Error(body.message ?? "That didn't send. Please try again.");
      setDone({ bookingUrl: body.bookingUrl ?? null, name: checked.enquiry.name, email: checked.enquiry.email });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn't send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    const calendar = done.bookingUrl ? withPerson(done.bookingUrl, done.name, done.email) : null;
    return (
      <div className="book-form" role="status">
        <h2 className="section-title small-title">Thanks, {done.name.split(" ")[0]}.</h2>
        {calendar ? (
          <>
            <p>Your details are with us. Pick a time that suits you and it&rsquo;s booked.</p>
            <a href={calendar} className="big-button primary" target="_blank" rel="noopener noreferrer">
              Pick a time &rarr;
            </a>
          </>
        ) : (
          <p>Your details are with us. We&rsquo;ll email {done.email} to find a time that suits you.</p>
        )}
        <p className="small muted">
          While you wait, you can <Link href="/app/new">run the free check on your website</Link>, so we can look at the
          results together on the call.
        </p>
      </div>
    );
  }

  return (
    <form className="book-form" onSubmit={submit} noValidate>
      <div className="two">
        <div>
          <label htmlFor="bf-name">Your name</label>
          <input id="bf-name" name="name" type="text" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="bf-email">Email</label>
          <input id="bf-email" name="email" type="email" autoComplete="email" required />
        </div>
      </div>
      <div className="two">
        <div>
          <label htmlFor="bf-business">Business name</label>
          <input id="bf-business" name="business" type="text" autoComplete="organization" />
        </div>
        <div>
          <label htmlFor="bf-website">Website, if you have one</label>
          <input id="bf-website" name="website" type="url" inputMode="url" placeholder="yourbusiness.com" />
        </div>
      </div>
      <div>
        <label htmlFor="bf-stage">Where are you now?</label>
        <select id="bf-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Choose one</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "0.4rem" }}>What would you like help with?</legend>
        <div className="choices">
          {SERVICE_CHOICES.map((s) => (
            <label key={s.key} className="choice">
              <input type="checkbox" checked={services.includes(s.key)} onChange={() => toggle(s.key)} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="bf-message">Anything we should know? (optional)</label>
        <textarea id="bf-message" name="message" placeholder="What you sell, who buys it, what you've tried." />
      </div>
      {/* A field people never see and bots fill in. */}
      <div className="trap" aria-hidden="true">
        <label htmlFor="bf-company-url">Leave this empty</label>
        <input id="bf-company-url" name="company_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {error ? <p className="small" style={{ color: "var(--bad)", margin: 0 }} role="alert">{error}</p> : null}
      <div>
        <button type="submit" className="big-button primary" disabled={sending}>
          {sending ? "Sending" : "Request my free call"}
        </button>
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>
        We use this only to reply to you. No mailing list. <Link href="/privacy">Privacy</Link>.
      </p>
    </form>
  );
}

/** Calendly and Cal.com both read name and email from the address. */
function withPerson(link: string, name: string, email: string): string {
  try {
    const url = new URL(link);
    url.searchParams.set("name", name);
    url.searchParams.set("email", email);
    return url.toString();
  } catch {
    return link;
  }
}
