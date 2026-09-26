import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { VERSUS } from "@/content/versus";
import { deskByKey, managerFor } from "@/lib/desks";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Against a traditional agency",
  description:
    "An AI-powered agency against a traditional one, one comparison per service. Every table lists the rows the traditional agency wins as well as the ones we do.",
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
              { name: "Against a traditional agency", path: "/vs" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Us vs a traditional agency</div>
        <h1 className="hero-title">Us vs the old way. <span className="hl">Honestly.</span></h1>
        <p className="hero-lede">Both give you a human to talk to. One comparison per service, including the rows they win.</p>
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
                  {manager.status === "live" ? `${wins} rows to us, ${losses} to them` : `${losses} rows to them`}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <CtaBand
        title="Or skip the comparison. Talk to us."
        body="A free call with a specialist. If a traditional agency suits you better, we'll tell you."
      />
    </MarketingChrome>
  );
}
