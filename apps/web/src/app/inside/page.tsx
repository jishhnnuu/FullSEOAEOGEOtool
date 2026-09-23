import Link from "next/link";

import { InsideAccount } from "@/components/inside-account";
import { CtaBand, MarketingChrome } from "@/components/marketing";
import { BRAND } from "@/lib/brand";
import { headcount } from "@/lib/org";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Look inside a live account",
  description:
    "A real working account, open to anyone, with no signup and no URL to enter. The director's brief, the queue, the fixes already written, and the findings on our own site we have not fixed yet.",
  alternates: { canonical: "/inside" },
};

/*
 * The page that does the most work on this site.
 *
 * An agency is a black box: you pay, and things happen in a channel you are
 * not in. The one thing this product can do that an agency cannot is show the
 * machine running, and until this page existed that was a claim rather than
 * something a stranger could check.
 *
 * It asks for nothing. No signup, no email, no domain. The account it opens is
 * our own site, audited live in the visitor's browser, with the findings we
 * have not fixed left in it.
 */

export default function InsidePage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Inside a live account", path: "/inside" },
            ]),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">Inside a live account</div>
        <h1 className="section-title">This is what you get. Look at it before you give us anything.</h1>
        <p className="section-lede">
          No signup, no email, no domain to type. Below is the workspace as a paying account sees it, running against
          our own site, right now, in your browser. The findings we have not fixed are still in it, because taking
          them out would make this a screenshot rather than an account.
        </p>
      </section>

      <section className="section section-tight">
        <InsideAccount />
      </section>

      <section className="section">
        <h2 className="section-title small-title">Three things worth noticing</h2>
        <div className="card-grid">
          <div className="card">
            <h3>It leads with the bad news</h3>
            <p>
              The director&rsquo;s brief opens with what is wrong and how much of it is already fixed, not with a
              green number. A director who leads with the good news is one nobody believes twice.
            </p>
          </div>
          <div className="card">
            <h3>One row says blocked</h3>
            <p>
              Authority is not scored, because nothing measures query demand without Search Console. The stage steps
              aside and names what would unblock it rather than scoring itself from a proxy. That is the product
              working correctly, not an error.
            </p>
          </div>
          <div className="card">
            <h3>Coverage sits above the count</h3>
            <p>
              You are told how many pages were read before you read any number derived from them. A score over forty
              of fifty-five pages is a score of those forty.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <h2 className="section-title small-title">What this account is, and what it is not</h2>
        <p>
          <strong>It is our own site.</strong> We own it, so nobody&rsquo;s permission is involved, and publishing our
          own failures is the same argument <Link href="/proof">the proof page</Link> makes. When a paying customer is
          willing to be the demo, this will point at a real client instead and say so.
        </p>
        <p>
          <strong>It is a partial crawl.</strong> A dozen or so of our own marketing pages rather than the full site,
          because this has to finish while you are looking at it. A paid run crawls everything the plan allows and
          states the coverage the same way.
        </p>
        <p>
          <strong>Nothing here is pre-computed.</strong> There is no cached result and no seeded data. The page fetches
          our pages, parses them, runs the catalogue and generates the fixes while you watch, which is also why it
          takes a moment and why it will look different next week.
        </p>
        <p>
          <strong>Some of the {headcount()} agents are not represented.</strong> The desks that need a server
          installation, a connected account or a model key cannot run in a public browser session, and the workspace
          marks each of those on screen rather than implying work is happening.{" "}
          <Link href="/the-firm">The full roster</Link> names which.
        </p>
      </section>

      <CtaBand
        title={`Point ${BRAND} at your site instead`}
        body="The same engine, the same catalogue, on your own pages. About four minutes, no account, no card. The results stay in your browser and you can export all of it."
        primary={{ href: "/app/new", label: "See what we would fix this week" }}
        secondary={{ href: "/pricing", label: "See the prices" }}
      />
    </MarketingChrome>
  );
}
