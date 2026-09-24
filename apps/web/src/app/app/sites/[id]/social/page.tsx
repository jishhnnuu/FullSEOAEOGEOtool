"use client";

import Link from "next/link";

import { PLATFORMS, readableForCompetitors } from "@/lib/social-platforms";
import { managerByKey } from "@/lib/org";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

export default function SocialOverview() {
  const { site } = useSite();
  const manager = managerByKey("social");
  if (!site || !manager) return null;
  const readable = readableForCompetitors();

  return (
    <>
      <PageHeader
        title="Social"
        description={`${manager.team.length} specialists. ${manager.remit}`}
      />

      <Notice kind="warn" title="Read this before the first teardown">
        Impressions and reach are owner-only on every platform. They are computed for the account
        holder and exposed only through that holder&rsquo;s own token, so no tool on earth can show
        you a competitor&rsquo;s reach without estimating it. This desk never prints one, and{" "}
        <Link href={`/app/sites/${site.id}/social/platforms`}>the capability map</Link> says exactly
        what each of the {PLATFORMS.length} platforms does and does not allow.
      </Notice>

      <div className="grid grid-2">
        <Card
          title="Competitor teardown"
          action={<Link href={`/app/sites/${site.id}/social/teardown`} className="small">Open</Link>}
        >
          <p className="small" style={{ marginTop: 0 }}>
            Read one competitor on any of the {readable.length} platforms that permit it. Returns
            their median engagement, every post that cleared twice it, and the traits those winners
            share: format, hook archetype, and whether their best posts sell harder or softer than
            their average.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            Twelve posts is the floor for a median. Three winners is the floor for a pattern.
          </p>
        </Card>

        <Card
          title="Compare brands"
          action={<Link href={`/app/sites/${site.id}/social/compare`} className="small">Open</Link>}
        >
          <p className="small" style={{ marginTop: 0 }}>
            Up to five brands at once. Share of posts is how loud a brand is, share of engagement is
            how much anyone cared, and the gap between the two is the number worth having.
          </p>
          <p className="tiny faint" style={{ marginBottom: 0 }}>
            A brand with forty per cent of the posts and twelve per cent of the engagement is not
            winning, it is shouting.
          </p>
        </Card>
      </div>

      <Card title="The order this desk works in">
        <ol className="small" style={{ paddingLeft: "1.1rem", margin: 0 }}>
          {manager.method.map((step, i) => <li key={i} style={{ marginBottom: "0.35rem" }}>{step}</li>)}
        </ol>
      </Card>

      <Card title="What this desk refuses, whatever you ask">
        <ul className="small muted" style={{ paddingLeft: "1.1rem", margin: 0 }}>
          {manager.refusals.map((line, i) => <li key={i} style={{ marginBottom: "0.4rem" }}>{line}</li>)}
        </ul>
      </Card>

      <Notice kind="warn" title="What needs the server installation">
        The research half of this desk runs here, in your browser, against public platform APIs with
        your own credentials. The production half, hooks, captions, the editorial gate, scheduling
        and community replies, runs on a server installation: Cloudflare Workers cannot run Python
        and those agents are Python.{" "}
        <Link href={`/app/sites/${site.id}/team`}>The roster marks which is which</Link>.
      </Notice>
    </>
  );
}
