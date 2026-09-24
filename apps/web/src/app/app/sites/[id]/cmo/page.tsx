"use client";

import { CmoChat } from "@/components/cmo-chat";
import { MANAGERS } from "@/lib/org";
import { planOf } from "@/lib/plans";
import { useSite } from "@/lib/site-hooks";
import { Card, PageHeader } from "@/components/ui";

/*
 * The one screen this product was missing.
 *
 * Nineteen screens and no way to ask a question. Everything else here is a
 * dashboard, and a dashboard is what an agency sends you instead of talking
 * to you. This is the conversation.
 */

export default function CmoPage() {
  const { site, result, workspace } = useSite();
  if (!site) return null;

  const plan = planOf(workspace.account?.plan);
  const live = new Set(MANAGERS.filter((m) => m.status === "live").map((m) => m.key));

  return (
    <>
      <PageHeader
        title="Your CMO"
        description="One person to talk to. They deal with the desks, batch the decisions, and lead with the bad news."
      />

      <Card>
        <CmoChat
          siteId={site.id}
          domain={site.domain}
          result={result ?? null}
          planName={plan.name}
          firstName={workspace.account?.name?.split(" ")[0] ?? null}
          model={workspace.model ?? null}
          desks={{
            search: live.has("search"),
            content: live.has("content") && plan.limits.contentDesk,
            social: live.has("social") && plan.limits.socialDesk,
            paid: live.has("paid") && plan.limits.paidDesk,
          }}
        />
      </Card>
    </>
  );
}
