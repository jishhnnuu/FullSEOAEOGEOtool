import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { Seat } from "@/components/seat";
import { Sprig } from "@/components/sprig";
import { BOOK, serviceByKey, servicePrice } from "@/lib/services";
import { breadcrumbNode, faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Website design and build for new businesses",
  description:
    "A website built with you, on a platform you own, with SEO done properly from launch. A specialist leads the build, AI speeds up the groundwork, and the price is fixed before we start.",
  alternates: { canonical: "/websites" },
};

/*
 * Websites, the service with no desk.
 *
 * A build is led by a person on our team. The AI helps with the legwork
 * (research, first drafts of the words, the SEO groundwork) and the audit
 * engine checks the site before it launches, which is the one part of this
 * page that is software you can try today. Nothing here implies a website
 * generator, because there is not one, and a founder who expected one would
 * be right to feel misled.
 */

const FAQ = [
  {
    q: "Who owns the website?",
    a: "You do. It's built on a platform in your name, like WordPress, Webflow or Shopify, with your login. If you stop working with us, it stays exactly where it is.",
  },
  {
    q: "Do I need to write the words?",
    a: "No. Your specialist talks it through with you, our AI drafts the pages from that conversation and from what your competitors say, and you correct anything that isn't quite you.",
  },
  {
    q: "How long does it take?",
    a: "It depends on how many pages and how quickly you can review them. We agree the timeline on the first call and put it in writing.",
  },
  {
    q: "I already have a website. Do I need a new one?",
    a: "Often not. Run the free check first. If the site is sound, fixing it is cheaper than rebuilding it, and we will say so.",
  },
  {
    q: "What happens after launch?",
    a: "Google Search Console and Analytics are connected on day one, so you can see who arrives. If you want, we then look after the SEO, content, ads or social that bring people to it.",
  },
];

const WORK = [
  { title: "A plan first", body: "Who it's for, what they need to read, and what you want them to do. Agreed on a call." },
  { title: "Words written for you", body: "Drafted by AI from your conversation, edited by your specialist, approved by you." },
  { title: "Design that fits you", body: "Clean, fast and on-brand, laid out around what your customers came to find." },
  { title: "On a platform you own", body: "WordPress, Webflow, Shopify or similar, in your name. No lock-in, no mystery hosting." },
  { title: "Found from day one", body: "Titles, structure, speed, schema and sitemaps checked by our own audit before launch." },
  { title: "Measured from day one", body: "Search Console and Analytics connected at launch, so the first visitors are counted." },
];

export default function WebsitesPage() {
  const service = serviceByKey("websites");
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Websites", path: "/websites" },
            ]),
            faqNode(FAQ),
          ),
        }}
      />

      <section className="section section-alt desk-hero-band seat-room" data-desk="cmo">
        <h1 className="hero-title">
          <Seat text="A website that brings you customers." word="website" />
        </h1>
        <p className="hero-lede">
          No website yet, or one you&rsquo;d rather nobody saw? We build it with you, on a platform you own, set up to
          be found on Google from the first day.
        </p>
        <div className="hero-actions">
          <Link href={`${BOOK.href}?service=websites`} className="big-button primary">{BOOK.label} &rarr;</Link>
          <Link href="/thymelab/seo/audit" className="big-button">Check my current site free</Link>
        </div>
        <p className="hero-status">
          <span className="dot" aria-hidden="true" />
          <span><b>Led by a specialist.</b> AI speeds up the legwork. You approve every page before it goes live.</span>
        </p>
      </section>

      <section className="section">
        <blockquote className="worry-quote">I know I need a website. I don&rsquo;t know where to start.</blockquote>
        <p className="section-lede" style={{ marginBottom: 0 }}>
          That&rsquo;s the usual starting point, and it&rsquo;s fine. You bring the business. We bring the plan, the
          words, the design and the setup.
        </p>
      </section>

      <section className="section section-alt">
        <h2 className="section-title">What you get.</h2>
        <div className="work-grid" style={{ marginTop: "1.4rem" }}>
          {WORK.map((item) => (
            <div className="work-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="tag go">Done for you</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">How a build goes.</h2>
        <div className="steps3 four" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>A free call</h3>
            <p>What you sell, who buys it and what the site has to do. You leave with a page plan.</p>
          </div>
          <div>
            <h3>Words and design</h3>
            <p>Drafted fast with AI, shaped by your specialist, sent to you to approve page by page.</p>
          </div>
          <div>
            <h3>Checked before launch</h3>
            <p>Our own audit reads every page the way Google does. Problems are fixed before anyone sees them.</p>
          </div>
          <div>
            <h3>Launched and handed over</h3>
            <p>It&rsquo;s yours, with the logins. We stay on to grow it only if you want us to.</p>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="price">
        <h2 className="section-title">What it costs.</h2>
        <div className="price-strip" style={{ marginTop: "1.2rem" }}>
          <div>
            <div className="ps-us" style={service.from === null ? { fontSize: "1.35rem" } : undefined}>{servicePrice(service)}</div>
            <div className="small muted">A fixed price for the build, agreed before we start.</div>
          </div>
          <ul className="ps-incl">
            <li>A specialist leads the build</li>
            <li>SEO done properly from launch</li>
            <li>You own the site and the logins</li>
          </ul>
          <Link href={`${BOOK.href}?service=websites`} className="big-button primary">{BOOK.label}</Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Quick questions.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          {FAQ.map((item) => (
            <details className="acc" key={item.q}>
              <summary>{item.q}</summary>
              <div className="acc-body"><p>{item.a}</p></div>
            </details>
          ))}
        </div>
      </section>

      <CtaBand title="Let's plan your website." />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="rotate" />
    </MarketingChrome>
  );
}
