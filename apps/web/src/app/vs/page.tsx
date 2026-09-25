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

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Us vs an agency</div>
        <h1 className="hero-title">Us vs an agency. <span className="hl">Honestly.</span></h1>
        <p className="hero-lede">One comparison per desk, including the rows they win.</p>
      </section>

      <section className="section section-tight">
        <div className="mini-tools">
          {VERSUS.map((v) => {
            const desk = deskByKey(v.desk)!;
            const manager = managerFor(desk);
            const wins = v.rows.filter((r) => r.winner === "here").length;
            const losses = v.rows.filter((r) => r.winner === "agency").length;
            return (
              <Link href={`/vs/${v.slug}`} className="mini-tool" key={v.slug}>
                <strong>{v.title}</strong>
                <span>{v.description}</span>
                <span className="tag go" style={{ alignSelf: "flex-start", marginTop: "0.4rem" }}>
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
        title="Or skip the comparison. Watch the work."
        body="A real account on our own site, running live, unfixed bits and all."
        primary={{ href: "/inside", label: "Look inside" }}
        secondary={{ href: "/app/new", label: "Audit my site free" }}
      />
    </MarketingChrome>
  );
}
