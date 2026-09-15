/** Disconnect. Hands the grant back to the provider, not just our copy of it. */

import { json, notFound, withAuth } from "@/server/http";
import { forgetConnection } from "@/server/connections";
import { record } from "@/server/db";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return withAuth(request, async ({ e, who }) => {
    const gone = await forgetConnection(e, id, who.orgId);
    if (!gone) return notFound();
    await record(e, { orgId: who.orgId, userId: who.userId, action: "connection.removed", target: id });
    return json({ ok: true });
  });
}
