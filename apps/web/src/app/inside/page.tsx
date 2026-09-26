import Link from "next/link";

import { InsideDesks } from "@/components/inside-desks";
import { CtaBand, MarketingChrome } from "@/components/marketing";
import { TheFlow } from "@/components/the-flow";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Look inside a live account",
  description:
    "The AI team behind each service, running live in your browser with no signup. Crawl our site, measure a page against its rivals, tear down a competitor's socials, and check an ad budget.",
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

      <section className="section fresh-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Live, right now, no signup</div>
        <h1 className="hero-title">
          Watch the AI team <span className="hl">work.</span>
        </h1>
        <p className="hero-lede">
          This is what your specialist runs for you, live in your browser. Pick a service and poke it.
        </p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <InsideDesks />
      </section>

      <section className="section section-alt">
        <h2 className="section-title">Things to notice.</h2>
        <div className="steps3" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>Bad news first</h3>
            <p>What&rsquo;s broken comes before any nice green number.</p>
          </div>
          <div>
            <h3>It says &ldquo;can&rsquo;t&rdquo;</h3>
            <p>Not enough data? It tells you what&rsquo;s missing instead of guessing.</p>
          </div>
          <div>
            <h3>Coverage up top</h3>
            <p>How many pages it read, shown before any score built on them.</p>
          </div>
        </div>
        <details className="acc" style={{ marginTop: "1.8rem" }}>
          <summary>What this demo is, and isn&rsquo;t</summary>
          <div className="acc-body">
            <ul>
              <li>
                <strong>It&rsquo;s our own site,</strong> so nobody&rsquo;s permission is needed. Same idea as{" "}
                <Link href="/proof">our own audit</Link>.
              </li>
              <li><strong>It&rsquo;s a partial crawl,</strong> a dozen pages, so it finishes while you watch.</li>
              <li><strong>Nothing is pre-cooked.</strong> No cached results, no seeded data. It runs fresh every time.</li>
              <li>
                <strong>Some of the team isn&rsquo;t here.</strong> Anything needing a server, a
                connected account or a model key can&rsquo;t run in a public browser tab.{" "}
                <Link href="/the-firm">The full roster</Link> says which.
              </li>
            </ul>
          </div>
        </details>
      </section>

      <section className="section">
        <TheFlow />
      </section>

      <CtaBand
        title="Want this for your business?"
        body="A specialist sets it up with you and runs it. Or point the same engine at any website, free."
      />
    </MarketingChrome>
  );
}
