import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { BRAND } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Terms of use",
  description:
    "What this product promises, what it refuses, who owns what, and what happens to your advertising if you stop paying. Short, and written to be read.",
  alternates: { canonical: "/terms" },
};

/*
 * Terms, kept short on purpose.
 *
 * Required at a public URL by every advertising platform's app review, so the
 * paid desk cannot ship without this page existing. The temptation is to
 * paste four thousand words of boilerplate; the useful thing is to state the
 * handful of promises that actually differ from the category norm, including
 * the one about what happens to a client's campaigns when they leave.
 */

export default function TermsPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Terms", path: "/terms" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Terms</div>
        <h1 className="hero-title">Terms, <span className="hl">short.</span></h1>
        <p className="hero-lede">Only the bits that differ from everyone else. The rest is what you&rsquo;d expect.</p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Your work is yours</h2>
        <ul className="prose-list">
          <li>
            <strong>Your accounts stay yours.</strong> Your ad accounts, your Business Manager, your pixels, your
            audiences and your domains are yours and always were. We work inside them with permission you grant
            and can withdraw. Nothing is built inside an account we own, so leaving costs you nothing but the
            notice.
          </li>
          <li>
            <strong>Everything produced is yours.</strong> The campaigns, the creative, the copy, the keyword
            lists, the negative lists, the briefs and the drafts. If you stop paying us, they keep running and
            you keep them. There is no version of this where your advertising stops because a subscription
            lapsed.
          </li>
          <li>
            <strong>Your leads are yours.</strong> Passed straight to you and deleted with your workspace. Never
            sold, never shared, never used to train anything.
          </li>
        </ul>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Who does the work</h2>
        <ul className="prose-list">
          <li>
            <strong>A specialist looks after your account.</strong> Someone on our team runs your calls, sets up your
            accounts with you, directs the work and checks it before it reaches you.
          </li>
          <li>
            <strong>Much of the work is produced by AI.</strong> Research, audits, fixes, drafts, campaign builds
            and reports are made by AI systems under that specialist&rsquo;s direction. We say so plainly because it
            is how we charge less, and because you should know.
          </li>
          <li>
            <strong>You approve what goes live.</strong> Changes to your website, posts, campaigns and budget
            increases all wait for your yes.
          </li>
        </ul>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What you are responsible for</h2>
        <ul className="prose-list">
          <li>
            <strong>The money.</strong> Advertising spend is billed to you by the platform, not by us. We
            recommend, build and manage; you approve, and the platform charges your card.
          </li>
          <li>
            <strong>Approving what runs.</strong> Every campaign is activated by a person. Every budget increase
            is approved by a person. No setting in this product changes that, which also means a campaign you
            approved is one you approved.
          </li>
          <li>
            <strong>The truth of your claims.</strong> We check copy against the platforms&rsquo; published
            policies and against the facts you gave us. We cannot verify that your product does what you say it
            does, and where a claim needs evidence, that evidence is yours.
          </li>
          <li>
            <strong>Lawful use of your data.</strong> Where you ask us to upload a customer list, you are telling
            us you have a lawful basis to do so.
          </li>
        </ul>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What we refuse, in writing, before you pay</h2>
        <ul className="prose-list">
          <li>
            We will not spend your money on an account whose conversions cannot be measured, and we will not sell
            you a smaller version of the service instead.
          </li>
          <li>
            We will not accept a budget below the level at which the platform&rsquo;s bidding can work, and we
            will show you the arithmetic rather than taking it.
          </li>
          <li>
            We will not report a change as applied that was not applied, or a modelled number as a measured one.
          </li>
          <li>
            We will not add up what the advertising platforms each claim and present the total as your results.
          </li>
          <li>
            We will not charge a percentage of your advertising spend, ever. It is the conflict at the centre of
            this industry. <Link href="/pricing">Our fee is fixed</Link> and does not move with your budget.
          </li>
        </ul>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What we cannot promise</h2>
        <p>
          Results. Nobody can, and anybody who does is telling you something about themselves. What is promised
          is the work, done to a standard you can inspect, with the numbers reported honestly including the weeks
          they are bad.
        </p>
        <p>
          Platform access is also not entirely ours to give. Each advertising network decides who may write to it
          through software, and <Link href="/paid">the paid ads page</Link> states exactly where each one stands
          rather than implying availability.
        </p>
      </section>

      <section className="section section-alt">
        <h2 className="section-title small-title">Ending it</h2>
        <p>
          Cancel whenever you like, by telling your specialist or from your account. Your campaigns keep running in your own
          accounts. Withdraw our access from the platform&rsquo;s own settings and it ends immediately whether or
          not you tell us. Delete your workspace and the server copy goes with it.
        </p>
        <p>
          {BRAND} may end an arrangement where the advertising would break a platform&rsquo;s policies or the law.
          Where that happens you will be told which rule and why.
        </p>
      </section>

      <CtaBand
        title="The parts that matter"
        body="A specialist on your account. Your accounts and your work stay yours. Every launch and every budget rise needs your yes. We never charge a percentage of your spend."
        secondary={{ href: "/privacy", label: "What we hold" }}
      />
    </MarketingChrome>
  );
}
