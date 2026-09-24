"use client";

import Link from "next/link";

import { AD_PLATFORMS } from "@/engine/ads.generated";
import { managerByKey } from "@/lib/org";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

/*
 * The paid desk inside a workspace.
 *
 * These five pages existed as navigation entries before they existed as
 * pages, which meant a paying customer who clicked Paid ads got a 404. That
 * is the worst class of bug this product can ship: the marketing site
 * describing a desk the product does not have.
 *
 * Every page here runs the same engine the public tools run, against the
 * workspace, and states plainly what it cannot do until an ad account is
 * connected. None of them pretends a connection exists.
 */

export default function PaidOverview() {
  const { site } = useSite();
  const manager = managerByKey("paid");
  if (!site || !manager) return null;

  const live = AD_PLATFORMS.filter((p) => p.status === "live");
  const base = `/app/sites/${site.id}/paid`;

  return (
    <>
      <PageHeader title="Paid ads" description={`${manager.team.length} specialists. ${manager.remit}`} />

      <Notice kind="warn" title="Read this before any money is discussed">
        This desk will not spend on an account whose conversions cannot be counted. A platform
        optimising toward an event it cannot see performs worse than one given no target at all, so
        a broken measurement setup gets a blocked service rather than a smaller one.{" "}
        <Link href={`${base}/readiness`}>Start with the readiness check</Link>, which is the gate.
      </Notice>

      {live.length === 0 && (
        <Notice kind="bad" title="No advertising platform is connected on this deployment yet">
          Every platform here has a complete write API, and what stands between this deployment and
          a live campaign is our own application to each network rather than anything in the code.
          Each network reviews the software that writes to it, because that software spends other
          people&rsquo;s money. Until an approval lands, everything below still runs: the readiness
          check, the budget arithmetic, the creative specifications and the policy check all work
          from your site alone.{" "}
          <Link href="/paid">The public page publishes our position in each queue</Link>.
        </Notice>
      )}

      <div className="grid grid-2">
        <Card title="Can we spend yet" action={<Link href={`${base}/readiness`} className="small">Open</Link>}>
          <p className="small" style={{ marginTop: 0 }}>
            The gate. Whether a conversion on this site can be counted, verified by round trip
            rather than by looking for a tag. Names the four things that separate present
            measurement from good measurement, one sentence each rather than a score.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            The only refusal in this product with no fallback.
          </p>
        </Card>

        <Card title="The plan" action={<Link href={`${base}/plan`} className="small">Open</Link>}>
          <p className="small" style={{ marginTop: 0 }}>
            Whether the budget can buy what it is being asked to buy, how many platforms it actually
            feeds, and a forecast only where the click cost and conversion rate have been measured.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            Thirty conversions a month per platform is the floor. Below it the bidding cannot learn.
          </p>
        </Card>

        <Card title="Creative and sizes" action={<Link href={`${base}/creative`} className="small">Open</Link>}>
          <p className="small" style={{ marginTop: 0 }}>
            Every distinct image a campaign needs, with the safe zone drawn, plus a character-limit
            and policy check on the copy before anything is submitted.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            Nearly half a Reels frame is platform interface. Every ad manager&rsquo;s preview hides that.
          </p>
        </Card>

        <Card title="Results, reconciled" action={<Link href={`${base}/results`} className="small">Open</Link>}>
          <p className="small" style={{ marginTop: 0 }}>
            What each platform claims, what your business actually recorded, and the gap explained.
            Platform conversions are never added together here.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            Blended cost per customer is the figure no attribution window can move.
          </p>
        </Card>
      </div>

      <Card title="What this desk refuses, whatever you ask for">
        <ul className="prose-list small">
          {manager.refusals.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </Card>
    </>
  );
}
