import Link from "next/link";

import { BookForm } from "@/components/book-form";
import { MarketingChrome } from "@/components/marketing";
import { breadcrumbNode, graph } from "@/lib/schema";

export const metadata = {
  title: "Book a free call",
  description:
    "Thirty minutes with a person about your business: your website, your customers and your budget. You leave with a plan and a fixed quote, whether or not you hire us.",
  alternates: { canonical: "/book" },
};

/*
 * The main action on the site. A founder who has never hired an agency wants
 * to talk to a person before anything else, so this page is short: what the
 * call is, what they leave with, and the form.
 */

export default function BookPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "Book a free call", path: "/book" },
            ]),
          ),
        }}
      />

      <section className="section fresh-hero" style={{ paddingBottom: "1.5rem" }}>
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Free, 30 minutes, no obligation</div>
        <h1 className="hero-title">
          Let&rsquo;s <span className="hl">talk</span> about your business.
        </h1>
        <p className="hero-lede">
          Tell us a little about where you are. A real person will get back to you to find a time.
        </p>
      </section>

      <section className="section section-tight" style={{ paddingTop: 0 }}>
        <div className="book-grid">
          <BookForm />
          <aside className="book-side">
            <div className="card-plain">
              <h3>On the call</h3>
              <ol>
                <li>We ask about your business, your customers and what you&rsquo;ve tried.</li>
                <li>If you have a website, we look at it together.</li>
                <li>We tell you what we&rsquo;d do first, and what we wouldn&rsquo;t bother with.</li>
              </ol>
            </div>
            <div className="card-plain">
              <h3>You leave with</h3>
              <ul>
                <li>A plan you can keep, whether or not you hire us</li>
                <li>A fixed monthly quote, in writing</li>
                <li>No pressure. If we&rsquo;re not the right fit, we&rsquo;ll say so.</li>
              </ul>
            </div>
            <div className="card-plain">
              <h3>Not ready to talk?</h3>
              <p className="small muted" style={{ margin: "0 0 0.6rem" }}>
                Run the free check on your website first. It takes about four minutes.
              </p>
              <Link href="/app/new" className="fresh-btn ghost" style={{ paddingLeft: 0 }}>Check my website &rarr;</Link>
            </div>
          </aside>
        </div>
      </section>
    </MarketingChrome>
  );
}
