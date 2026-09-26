/**
 * Book-a-call enquiries: stored, emailed to the team, readable by the owners.
 *
 * An enquiry arrives before anyone has an account, so it belongs to no org.
 * The only people who can read the inbox are the signed-in users whose
 * address is listed in OWNER_EMAILS; anyone else gets the same 404 as a row
 * that does not exist.
 */

import type { Env } from "./env";
import { database } from "./env";
import { newId, sha256Hex } from "./crypto";
import { nowIso } from "./db";
import { send } from "./mail";
import { enquiryEmail, type Enquiry } from "@/engine/enquiry";

/** Enquiries allowed from one network address per hour. */
const PER_HOUR = 5;

export type StoredEnquiry = Enquiry & { id: string; status: string; createdAt: string };

export function isOwner(e: Env, email: string | null | undefined): boolean {
  if (!email || !e.OWNER_EMAILS) return false;
  const owners = e.OWNER_EMAILS.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return owners.includes(email.toLowerCase());
}

export async function ipHash(request: Request): Promise<string | null> {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip ? sha256Hex(`enquiry:${ip}`) : null;
}

export async function tooMany(e: Env, hash: string | null): Promise<boolean> {
  if (!hash || !e.DB) return false;
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const row = await database(e)
    .prepare("SELECT COUNT(*) AS n FROM enquiries WHERE ip_hash = ?1 AND created_at > ?2")
    .bind(hash, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= PER_HOUR;
}

/**
 * Keep the enquiry, and tell the team. Either half can be missing on a
 * deployment that is not fully set up, and the result says which happened so
 * the form never claims a delivery that did not occur.
 */
export async function takeEnquiry(
  e: Env,
  enquiry: Enquiry,
  hash: string | null,
): Promise<{ stored: boolean; emailed: boolean }> {
  const createdAt = nowIso();
  let stored = false;
  if (e.DB) {
    await database(e)
      .prepare(
        `INSERT INTO enquiries (id, name, email, business, website, stage, services, message, source, ip_hash, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'new', ?11)`,
      )
      .bind(
        newId("enq"),
        enquiry.name,
        enquiry.email,
        enquiry.business,
        enquiry.website,
        enquiry.stage,
        JSON.stringify(enquiry.services),
        enquiry.message,
        enquiry.source,
        hash,
        createdAt,
      )
      .run();
    stored = true;
  }

  let emailed = false;
  if (e.CONTACT_EMAIL && e.RESEND_API_KEY) {
    const mail = enquiryEmail(enquiry, createdAt);
    const result = await send(e, { to: e.CONTACT_EMAIL, subject: mail.subject, text: mail.text, replyTo: enquiry.email });
    emailed = result.ok;
  }
  return { stored, emailed };
}

type Row = {
  id: string;
  name: string;
  email: string;
  business: string | null;
  website: string | null;
  stage: string | null;
  services: string | null;
  message: string | null;
  source: string | null;
  status: string;
  created_at: string;
};

export async function listEnquiries(e: Env): Promise<StoredEnquiry[]> {
  const result = await database(e)
    .prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 500")
    .all<Row>();
  return (result.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    business: r.business,
    website: r.website,
    stage: r.stage,
    services: r.services ? (JSON.parse(r.services) as string[]) : [],
    message: r.message,
    source: r.source,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export const STATUSES = ["new", "contacted", "booked", "client", "not a fit"] as const;

export async function setStatus(e: Env, id: string, status: string): Promise<boolean> {
  if (!(STATUSES as readonly string[]).includes(status)) return false;
  const result = await database(e).prepare("UPDATE enquiries SET status = ?1 WHERE id = ?2").bind(status, id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function deleteEnquiry(e: Env, id: string): Promise<boolean> {
  const result = await database(e).prepare("DELETE FROM enquiries WHERE id = ?1").bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}
