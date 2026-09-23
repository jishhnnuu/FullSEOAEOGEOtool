import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { VERSUS } from "@/content/versus";
import { deskByKey, managerFor } from "@/lib/desks";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Against an agency",
  description:
    "Four comparisons, one per desk, against the kind of agency that desk replaces. Every table lists the rows the agency wins as well as the ones we do.",
  alternates: { canonical: "/vs" },
};

export default function VersusIndex() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Against an agency", path: "/vs" },
            ]),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">Against an agency</div>
        <h1 className="section-title">Four comparisons, one per desk.</h1>
        <p className="section-lede">
          Somebody weighing an SEO retainer is making a different decision from somebody weighing a PPC one, so one
          generic page about agencies answers neither. Each table below lists the rows an agency genuinely wins, and
          each page ends with the cases where we would tell you to hire them.
        </p>
      </section>

      <section className="section section-tight">
        <div className="card-grid">
          {VERSUS.map((v) => {
            const desk = deskByKey(v.desk)!;
            const manager = managerFor(desk);
            const wins = v.rows.filter((r) => r.winner === "here").length;
            const losses = v.rows.filter((r) => r.winner === "agency").length;
            return (
              <Link href={`/vs/${v.slug}`} className="card link-card" key={v.slug}>
                <h3>{v.title}</h3>
                <p>{v.description}</p>
                <span className="small">
                  {manager.status === "live"
                    ? `${wins} rows to us, ${losses} to them`
                    : `Desk opens ${manager.opens}. ${losses} rows to them.`}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <CtaBand
        title="Or skip the comparison and look at the work"
        body="A real account on our own site, running live, with the findings we have not fixed still in it."
        primary={{ href: "/inside", label: "Look inside a live account" }}
        secondary={{ href: "/the-firm", label: "Meet the firm" }}
      />
    </MarketingChrome>
  );
}
