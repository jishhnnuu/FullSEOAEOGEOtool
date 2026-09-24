"use client";

import { NEVER_AVAILABLE, PLATFORMS, readableForCompetitors } from "@/lib/social-platforms";
import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";

/*
 * The capability map, on screen, before any work is promised.
 *
 * This is the page a client should read first, and it is the one no other
 * social tool ships. Four of ten platforms permit a competitor teardown. The
 * other six say why not, in their own terms rather than ours.
 */

export default function PlatformsPage() {
  const { site } = useSite();
  if (!site) return null;
  const readable = readableForCompetitors();

  return (
    <>
      <PageHeader
        title="What each platform allows"
        description={`${readable.length} of ${PLATFORMS.length} platforms permit a competitor teardown. The rest are blocked by the platform's own terms rather than by anything this desk could build around.`}
      />

      <Notice kind="warn" title="No competitor impressions exist, anywhere">
        Impressions, reach and saves are computed by the platform for the account owner and exposed
        only through that owner&rsquo;s own token. There is no API, no partner tier and no scraper
        that returns them for an account you do not own. Every competitor reach figure you have been
        shown by any tool or agency was estimated from follower count. This desk never prints one.
        The full list of what is owner-only: {NEVER_AVAILABLE.join(", ")}.
      </Notice>

      {PLATFORMS.map((p) => (
        <Card
          key={p.key}
          title={p.name}
          action={
            p.competitorPosts
              ? <Badge kind="ok">competitors readable</Badge>
              : <Badge kind="high">no competitor data</Badge>
          }
        >
          <dl className="kv">
            <dt>Your own account</dt>
            <dd>{p.ownAccount ? "Connectable, with full owner insights" : "No organic API at all"}</dd>
            <dt>Competitor posts</dt>
            <dd>
              {p.competitorPosts
                ? p.competitorMetrics.join(", ")
                : "Nothing. See the limitation below."}
            </dd>
            <dt>What it takes</dt>
            <dd>{p.requires}</dd>
            <dt>Cost</dt>
            <dd>
              {p.access === "free" ? "Free" :
                p.access === "paid" ? "Paid plan required" :
                  p.access === "gated" ? "Behind an application most businesses will not be granted" :
                    "Not available"}
            </dd>
            <dt>Publishing</dt>
            <dd>{p.canPublish ? "Possible, with a person approving every post" : "No publishing API"}</dd>
          </dl>
          {p.limitation && (
            <p className="small" style={{ color: "var(--warn)", marginBottom: 0, marginTop: "0.7rem" }}>
              <strong>Limitation.</strong> {p.limitation}
            </p>
          )}
        </Card>
      ))}

      <Card title="Why this page exists">
        <p className="small">
          Every competitor in this category shows a rival&rsquo;s reach. None of them can have it, so all
          of them are estimating, and almost none say so. Publishing the map costs a slide and buys the
          rest of the engagement, because a client who has been shown an invented number once will
          recognise the honesty immediately.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          Where a platform changes its terms, this page changes with it. The same map drives what the
          agents are allowed to promise, so an agent cannot offer work a platform forbids.
        </p>
      </Card>
    </>
  );
}
