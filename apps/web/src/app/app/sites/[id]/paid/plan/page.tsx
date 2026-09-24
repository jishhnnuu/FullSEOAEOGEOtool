"use client";

import Link from "next/link";
import { AdBudgetTool } from "@/components/ad-budget-tool";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

/*
 * The budget arithmetic, inside the workspace.
 *
 * Deliberately the same component the public tool uses. A prospect and a
 * paying customer get the same answer from the same code, which is the only
 * way the free tool can be trusted as a preview of the paid one.
 */

export default function PaidPlan() {
  const { site } = useSite();
  // The organic overlap is the first subtraction an honest media plan makes:
  // paying for a term the site already ranks first for mostly buys clicks the
  // business was getting free. It needs a position, and a crawl cannot see
  // one. Rather than substituting a proxy from the keyword model, which would
  // be a guess dressed as a finding, the page says what would unblock it.
  const hasSearchConsole = false;
  if (!site) return null;

  return (
    <>
      <PageHeader
        title="The plan"
        description="Whether the budget can buy what it is being asked to buy, before anybody designs a campaign."
      />

      <Card>
        <AdBudgetTool />
      </Card>

      {!hasSearchConsole && (
        <Card title="The subtraction this plan cannot make yet">
          <p className="small" style={{ marginTop: 0 }}>
            The first thing a media plan should remove is every term the site already ranks first
            for, because paid spend there mostly buys clicks the business was getting free. There
            are exceptions, defending a term a competitor bids on or a page that ranks but converts
            badly, and each needs an argument.
          </p>
          <p className="small">
            That subtraction needs a ranking position, and a crawl cannot see one. Connect Search
            Console and this page will list the terms to exclude, with the position beside each.
            Until then it is left blank rather than estimated from the keyword model, which would
            be a guess wearing a finding&rsquo;s clothes.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            <Link href={`/app/sites/${site.id}/integrations`}>Connections</Link> has the one-click
            grant. It is read-only and takes about thirty seconds.
          </p>
        </Card>
      )}

      <Notice kind="warn" title="What is still missing before this becomes a real plan">
        The arithmetic above needs nothing. Turning it into campaigns needs a connected ad account,
        a verified conversion round trip, and an offer the landing page actually supports.{" "}
        <Link href={`/app/sites/${site.id}/paid/readiness`}>The readiness check</Link> is the gate,
        and it comes first.
      </Notice>
    </>
  );
}
