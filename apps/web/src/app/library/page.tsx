import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { CATALOG_SIZE, CATEGORY_LABEL, byCategory } from "@/engine/catalog";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "The check library",
  description:
    "Every one of the 90 checks the crawler runs, published as its own entry: what it fires on, why it matters, the fix it writes, and where it has been deliberately narrowed after a false positive.",
  alternates: { canonical: "/library" },
};

/*
 * The catalogue, in public, one entry per check.
 *
 * Not a features page. A check you cannot read is a check you cannot argue
 * with, and the arguments are how a catalogue gets good. It is also the
 * organic engine: ninety individually addressable, linkable, quotable entries
 * is exactly the text an answer engine wants to cite, and it is the one asset
 * here that compounds.
 */

export default function LibraryPage() {
  const groups = byCategory();
  const order = Object.keys(CATEGORY_LABEL).filter((key) => groups[key]?.length);
  const autoFixable = Object.values(groups).flat().filter((d) => d.autoFixable).length;
  const critical = Object.values(groups).flat().filter((d) => d.severity === "critical").length;

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "The check library", path: "/library" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />The check library</div>
        <h1 className="hero-title">Every check we run. <span className="hl">All</span> {CATALOG_SIZE}.</h1>
        <p className="hero-lede">The real catalogue, in full: what each check looks for, why it matters, and whether we write the fix.</p>
        <div className="stat-row" style={{ marginTop: "1.2rem" }}>
          <div className="stat">
            <span className="stat-value">{CATALOG_SIZE}</span>
            <span className="stat-label">Checks, run on every crawl</span>
          </div>
          <div className="stat">
            <span className="stat-value">{autoFixable}</span>
            <span className="stat-label">Where the engine writes the fix itself</span>
          </div>
          <div className="stat">
            <span className="stat-value">{critical}</span>
            <span className="stat-label">Critical, meaning a page can be dropped</span>
          </div>
          <div className="stat">
            <span className="stat-value">{order.length}</span>
            <span className="stat-label">Areas the catalogue covers</span>
          </div>
        </div>
      </section>

      {order.map((category) => (
        <section className="section section-tight" key={category}>
          <h2 className="section-title small-title">
            {CATEGORY_LABEL[category]} <span className="faint">&middot; {groups[category].length}</span>
          </h2>
          <div className="check-list">
            {groups[category].map((def) => (
              <Link href={`/library/${def.code}`} className="check-row" key={def.code}>
                <span className={`badge badge-${def.severity}`}>{def.severity}</span>
                <span className="check-title">
                  <strong>{def.title}</strong>
                  <span className="tiny faint mono">{def.code}</span>
                </span>
                <span className="check-fix">
                  {def.autoFixable
                    ? <span className="written">fix written</span>
                    : <span className="tiny faint">needs a decision</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="section section-alt">
        <h2 className="section-title small-title">Why the whole catalogue is public</h2>
        <p>
          A false positive is more expensive than a miss. One wrong high-severity finding teaches you to discount the
          severe ones, which are the only ones worth reading, so a check gets narrowed rather than left to fire
          loosely. Publishing the catalogue is what makes that claim checkable instead of something we say.
        </p>
        <p>
          The same codes, severities and weightings run in both engines, the one in your browser and the one on a
          server installation, so the same problem scores the same way wherever it is found.
        </p>
      </section>

      <CtaBand
        title={`Run all ${CATALOG_SIZE} against your site`}
        body="About four minutes, in your browser. No account, no card. Every finding that can arrive with the fix already written, does."
        primary={{ href: "/app/new", label: "See what we would fix this week" }}
        secondary={{ href: "/inside", label: "Look inside a live account" }}
      />
    </MarketingChrome>
  );
}
