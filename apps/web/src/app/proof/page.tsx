import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { SelfAudit } from "@/components/self-audit";
import { BRAND } from "@/lib/brand";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Our own audit, in public",
  description:
    "This site, scored by its own engine, live, including the findings we have not fixed. Nobody else in this category publishes their own score.",
  alternates: { canonical: "/proof" },
};

export default function ProofPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Proof", path: "/proof" },
            ]),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">Proof</div>
        <h1 className="section-title">This site, audited by its own engine.</h1>
        <p className="section-lede">
          Every tool in this category asserts that it is good at SEO. None of them shows you its own score. The audit
          below runs live, on this page, against this site, using the same fetch route and the same 90-check catalogue
          a visitor&rsquo;s audit uses. Nothing is pre-computed and nothing is filtered out.
        </p>
      </section>

      <section className="section section-tight">
        <SelfAudit />
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Why this page exists</h2>
        <p>
          On 20 September 2026, before any of this was built, we ran our own engine against our own site and against a
          competitor&rsquo;s. Ours scored 51.5 on AI answer readiness. Theirs scored 62.6. We had no sitemap, no
          llms.txt, no structured data on any page, and a robots.txt that was thirty lines of comments and not a
          single directive.
        </p>
        <p>
          That was an uncomfortable result for a product that sells answer engine optimisation, and there were two
          available responses. One was to stop measuring. The other was to fix it and publish the number permanently,
          including on the days it gets worse. This page is the second.
        </p>
        <p>
          It is also the only claim on this site that cannot be faked, because the audit runs in your browser against
          our live origin. If you do not believe the numbers, the same engine is{" "}
          <Link href="/tools">available as ten free tools</Link> and you can point them here.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What this page deliberately does not show</h2>
        <ul className="prose-list">
          <li>
            <strong>Authority.</strong> Nothing here measures a backlink profile, and links are most of what authority
            means. A score whose main input is missing does not render as a number, on our site or on yours.
          </li>
          <li>
            <strong>A full-site score.</strong> This is the homepage, not a crawl. Checks that need more than one page
            to mean anything are excluded rather than answered from one.
          </li>
          <li>
            <strong>Rankings or traffic.</strong> {BRAND} is new and has neither. Publishing a traffic chart would be
            the first dishonest thing on this site.
          </li>
        </ul>
      </section>

      <CtaBand
        title="Run the same engine on your site"
        body="No account, no card, no connections. You will get the same treatment we just gave ourselves."
      />
    </MarketingChrome>
  );
}
