import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { VERSUS, VERSUS_BY_SLUG } from "@/content/versus";
import { BRAND } from "@/lib/brand";
import { deskByKey } from "@/lib/desks";
import { BOOK, serviceByKey, servicePrice } from "@/lib/services";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

export function generateStaticParams() {
  return VERSUS.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = VERSUS_BY_SLUG.get(slug);
  if (!v) return {};
  return { title: v.title, description: v.description, alternates: { canonical: `/vs/${v.slug}` } };
}

export default async function VersusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = VERSUS_BY_SLUG.get(slug);
  if (!v) notFound();

  const desk = deskByKey(v.desk)!;
  const service = serviceByKey(v.desk);
  const wins = v.rows.filter((r) => r.winner === "here").length;
  const losses = v.rows.filter((r) => r.winner === "agency").length;

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: v.title, path: `/vs/${v.slug}` },
            ]),
            faqNode([
              { q: `Should I use ${BRAND} or ${v.rival}?`, a: `${v.decision} ${v.chooseAgency[0]}` },
              { q: "What does it cost?", a: `${servicePrice(service)}, a fixed monthly fee with a person included. ${v.rival} typically charges ${service.agency}: ${service.agencyBasis.toLowerCase()}` },
            ]),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">{service.label} &middot; against {v.rival}</div>
        <h1 className="hero-title">{v.title}</h1>
        <p className="hero-lede">{v.decision}</p>
        <p className="small faint" style={{ marginTop: "0.9rem" }}>
          {v.rows.length} questions below. We win {wins} of them and {v.rival} wins {losses}. A comparison that gives
          the other side nothing is read as marketing and discarded, so the losses are on the same table as the wins.
        </p>
      </section>

      <section className="section section-tight">
        <div className="vs-table">
          <div className="vs-head">
            <span>The question</span>
            <span>{v.rival.charAt(0).toUpperCase() + v.rival.slice(1)}</span>
            <span>{BRAND}</span>
          </div>
          {v.rows.map((row) => (
            <div className="vs-row" key={row.question}>
              <span className="vs-q">{row.question}</span>
              <span className={row.winner === "agency" ? "vs-cell wins" : "vs-cell"}>{row.agency}</span>
              <span className={row.winner === "here" ? "vs-cell wins" : "vs-cell"}>{row.here}</span>
            </div>
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
          The shaded cell is the honest answer to that row, not the one we would prefer.
        </p>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">When {v.rival} is the right answer.</h2>
        <p className="section-lede">
          Three cases where we would tell you to hire them. If one of these is you, the rest of this site is not going
          to change that and pretending otherwise wastes your quarter.
        </p>
        <ul className="prose-list">
          {v.chooseAgency.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-title small-title">What our {service.label.toLowerCase()} service actually is</h2>
        <p>{desk.lede}</p>
        <p style={{ marginTop: "1rem" }}>
          <Link href={desk.path} className="button primary">Read about {service.label.toLowerCase()}</Link>{" "}
          <Link href="/vs" className="button">The other comparisons</Link>
        </p>
      </section>

      <CtaBand
        title="Ask us the hard questions."
        body="A free call with a person. If a traditional agency suits you better, we'll say so."
        primary={BOOK}
        secondary={{ href: "/inside", label: "See the dashboard first" }}
      />
    </MarketingChrome>
  );
}
