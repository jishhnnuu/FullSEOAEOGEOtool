/**
 * One enquiry, for an owner: change its status, or delete it (someone asked
 * to be forgotten). Anyone else gets 404, the same as a row that is not there.
 */

import { fail, json, notFound, withAuth } from "@/server/http";
import { deleteEnquiry, isOwner, setStatus } from "@/server/enquiries";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return withAuth(request, async ({ e, who }) => {
    if (!isOwner(e, who.email)) return notFound();
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    if (!body.status) return fail("no_status", "Say which status.");
    return (await setStatus(e, id, body.status)) ? json({ ok: true }) : notFound();
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return withAuth(request, async ({ e, who }) => {
    if (!isOwner(e, who.email)) return notFound();
    return (await deleteEnquiry(e, id)) ? json({ ok: true }) : notFound();
  });
}
