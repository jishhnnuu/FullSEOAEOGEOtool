/**
 * What the book-a-call form may carry, checked the same way in the browser
 * and on the server.
 *
 * Pure on purpose, so it is tested without a Worker. The server stores only
 * what passes here, trimmed and capped, and the form shows the same sentence
 * the server would have sent back.
 */

export const SERVICE_CHOICES = [
  { key: "websites", label: "A website" },
  { key: "search", label: "SEO" },
  { key: "paid", label: "Paid ads" },
  { key: "social", label: "Social media" },
  { key: "content", label: "Content" },
  { key: "everything", label: "All of it" },
  { key: "unsure", label: "Not sure yet" },
] as const;

export const STAGES = [
  { key: "idea", label: "Just starting, no website yet" },
  { key: "site", label: "We have a website, not many customers from it" },
  { key: "growing", label: "Growing, ready to spend on marketing" },
  { key: "team", label: "We have a marketing team and want support" },
] as const;

export type EnquiryInput = {
  name?: unknown;
  email?: unknown;
  business?: unknown;
  website?: unknown;
  stage?: unknown;
  services?: unknown;
  message?: unknown;
  source?: unknown;
};

export type Enquiry = {
  name: string;
  email: string;
  business: string | null;
  website: string | null;
  stage: string | null;
  services: string[];
  message: string | null;
  source: string | null;
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** A plain enough check for an address: something, an at, a dot after it, no spaces. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 200;
}

/** The address as typed, made into a URL if it can be. Null when it cannot. */
export function normaliseWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!url.hostname.includes(".")) return null;
    return url.toString().slice(0, 200);
  } catch {
    return null;
  }
}

export function validateEnquiry(input: EnquiryInput): { ok: true; enquiry: Enquiry } | { ok: false; message: string } {
  const name = text(input.name, 100);
  if (!name) return { ok: false, message: "Tell us your name, so we know who we're talking to." };
  const email = text(input.email, 200)?.toLowerCase() ?? null;
  if (!email || !looksLikeEmail(email)) return { ok: false, message: "That email address doesn't look right." };

  const websiteRaw = text(input.website, 200);
  const website = normaliseWebsite(websiteRaw);
  if (websiteRaw && !website) return { ok: false, message: "That website address doesn't look right. Leave it blank if you don't have one yet." };

  const stageRaw = text(input.stage, 40);
  const stage = STAGES.some((s) => s.key === stageRaw) ? stageRaw : null;

  const allowed = new Set<string>(SERVICE_CHOICES.map((s) => s.key));
  const services = Array.isArray(input.services)
    ? [...new Set(input.services.filter((s): s is string => typeof s === "string" && allowed.has(s)))]
    : [];

  return {
    ok: true,
    enquiry: {
      name,
      email,
      business: text(input.business, 120),
      website,
      stage,
      services,
      // Newlines matter in a message, so this one keeps them.
      message: typeof input.message === "string" && input.message.trim() ? input.message.trim().slice(0, 2000) : null,
      source: text(input.source, 80),
    },
  };
}

/** The email the team receives. Plain text, every field labelled. */
export function enquiryEmail(e: Enquiry, when: string): { subject: string; text: string } {
  const label = (key: string) => SERVICE_CHOICES.find((s) => s.key === key)?.label ?? key;
  const stage = STAGES.find((s) => s.key === e.stage)?.label ?? "Not said";
  return {
    subject: `New call request: ${e.name}${e.business ? `, ${e.business}` : ""}`,
    text: [
      `${e.name} asked for a call.`,
      "",
      `Email: ${e.email}`,
      `Business: ${e.business ?? "Not said"}`,
      `Website: ${e.website ?? "None yet"}`,
      `Where they are: ${stage}`,
      `Interested in: ${e.services.length ? e.services.map(label).join(", ") : "Not said"}`,
      `Came from: ${e.source ?? "the book page"}`,
      `Sent: ${when}`,
      "",
      e.message ? `What they said:\n${e.message}` : "No message.",
      "",
      "Reply to this email to answer them directly.",
    ].join("\n"),
  };
}
