import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { BRAND, SITE_HOST } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Privacy policy",
  description:
    "What this product collects, where it lives, what never leaves your browser, and how to delete all of it. Written to be read, not to be defended.",
  alternates: { canonical: "/privacy" },
};

/*
 * A privacy policy that is also a piece of product documentation.
 *
 * Every advertising platform requires one at a public URL before it will let
 * software manage somebody's ad account, so this page is a gate on the paid
 * desk shipping at all. That is a reason to write it, not a reason to write
 * boilerplate: the unusual thing about this product is how little it holds,
 * and a policy nobody can read hides that.
 */

export default function PrivacyPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Privacy", path: "/privacy" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Privacy</div>
        <h1 className="hero-title">Privacy, in <span className="hl">plain</span> English.</h1>
        <p className="hero-lede">Most of this runs in your browser and sends us nothing. Here&rsquo;s the rest, in order of importance.</p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The audit sends us nothing</h2>
        <p>
          The crawl, the ninety checks, the scoring, the fixes, the schema, the briefs and the link plans all run
          in your browser and store their results in your browser. With no account, nothing about the site you
          audited reaches us at all. Closing the tab and clearing the site data removes it entirely, and there is
          no copy on our side to ask about.
        </p>
        <p>
          That is not a privacy feature bolted on. It is how the product is built, and it is why the whole thing
          keeps working with every external account disconnected.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">If you make an account</h2>
        <ul className="prose-list">
          <li>
            <strong>Your email address and name</strong>, from the sign-in you chose. Used to identify you and to
            send the reports and alerts you asked for. Nothing else.
          </li>
          <li>
            <strong>Your workspace</strong>: the sites you added, the runs, the findings, the fixes and the
            approvals. A server copy of what your browser already holds, so scheduled work can happen while the
            tab is closed.
          </li>
          <li>
            <strong>A hash of your session cookie, never the cookie.</strong> Only its SHA-256 is stored, so a
            copy of our database cannot be replayed as a login to your account.
          </li>
          <li>
            <strong>An audit log</strong> of what each agent did and what you approved. This exists so you can
            check us, and it is the last thing we would remove.
          </li>
        </ul>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Accounts you connect</h2>
        <p>
          Connecting Search Console, Analytics, a CMS or an advertising platform stores a token that lets us do
          the specific things the consent screen listed. Three things about those tokens:
        </p>
        <ul className="prose-list">
          <li>
            <strong>They are sealed with a per-record key.</strong> Each token is encrypted with its own data key,
            which is itself wrapped by a deployment key held outside the database. A database copy on its own
            opens nothing.
          </li>
          <li>
            <strong>No route ever returns one, in any form, including masked.</strong> A mask still confirms a
            value, so there is no screen and no API response anywhere in this product that shows any part of a
            stored secret.
          </li>
          <li>
            <strong>You revoke them without us.</strong> Every platform lets you withdraw access from your own
            account settings, and doing so takes effect immediately whether or not you tell us.
          </li>
        </ul>
        <p>
          We never ask you to paste an API key or a password for an advertising platform. You log in on the
          platform&rsquo;s own site and approve a consent screen listing exactly what we may do.{" "}
          <Link href="/paid">The paid desk page</Link> lists the scopes per platform and why each is needed.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Advertising data specifically</h2>
        <p>
          Where you connect an advertising account we read campaigns, spend, results and, with your permission,
          the leads your forms capture, so they can be passed to you and to your own systems. We write campaigns,
          creatives and budgets that you have approved.
        </p>
        <p>
          Leads captured by an advertising platform belong to you. They are passed through and stored in your
          workspace so you can work them, and they are deleted with your workspace. They are never sold, never
          shared with another customer, and never used to train anything.
        </p>
        <p>
          Where we send conversion events back to a platform to make measurement work, the personal identifiers
          in those events are hashed before they leave, as the platforms themselves require.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Model keys and drafting</h2>
        <p>
          Drafting uses <strong>your</strong> model provider key, relayed for that one request and never written
          down. We hold no model key of our own, on purpose: it means the platform keeps working with every
          external account disconnected, and it means your drafts do not pass through an account we control.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What we never do</h2>
        <ul className="prose-list">
          <li>Sell or rent anything about you or your customers, to anyone, for any purpose.</li>
          <li>Use your data, your site, your adverts or your leads to train a model.</li>
          <li>Show one customer&rsquo;s data to another. Every scoped read puts your organisation in the query
            itself, and a request for somebody else&rsquo;s row answers 404 rather than 403, because 403 would
            confirm the row exists.</li>
          <li>Run advertising trackers on this site.</li>
        </ul>
      </section>

      <section className="section section-alt">
        <h2 className="section-title small-title">Deleting everything</h2>
        <p>
          Delete your workspace from your account settings and the server copy goes, along with the connected
          tokens, the audit log and any leads held for you. It is immediate rather than queued, and it is not
          reversible.
        </p>
        <p>
          If you connected through a platform that offers its own deletion request, that request reaches us at{" "}
          <code>/api/data-deletion</code> and is honoured the same way, with a confirmation code you can use to
          check the status. You do not need to contact us to exercise this.
        </p>
        <p>
          For anything else, including a copy of what we hold, write to the address on{" "}
          <Link href="/security">the security page</Link>. {BRAND} is operated from the United Kingdom and this
          site is {SITE_HOST}.
        </p>
      </section>

      <CtaBand
        title="The short version"
        body="The audit sends us nothing. An account adds a server copy of your own workspace. Connected tokens are sealed per record and never returned by any route. You can delete all of it yourself, immediately."
        primary={{ href: "/security", label: "How the data is actually held" }}
        secondary={{ href: "/app/new", label: "Try it without an account" }}
      />
    </MarketingChrome>
  );
}
