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

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Proof</div>
        <h1 className="hero-title">We audit ourselves. <span className="hl">In public.</span></h1>
        <p className="hero-lede">This site, scored live by its own engine. Warts and all.</p>
      </section>

      <section className="section section-tight">
        <SelfAudit />
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Why we do this.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>Why this page exists</summary>
            <div className="acc-body">
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
                <Link href="/thymelab">available as free tools</Link> and you can point them here.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>What this page deliberately doesn&rsquo;t show</summary>
            <div className="acc-body">
              <ul>
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
            </div>
          </details>
        </div>
      </section>



      <CtaBand
        title="Your turn."
        body="Same engine, same treatment, on your site. No account, no card."
        primary={{ href: "/thymelab/seo/audit", label: "Check any website's SEO" }}
        secondary={{ href: "/book", label: "Or talk to a specialist" }}
      />
    </MarketingChrome>
  );
}
