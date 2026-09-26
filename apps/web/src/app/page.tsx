import Link from "next/link";

import { MarketingChrome } from "@/components/marketing";
import { Sprig } from "@/components/sprig";
import { UrlStart } from "@/components/url-start";
import { BOOK, SERVICES } from "@/lib/services";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  // The homepage keeps the layout's default title rather than restating it,
  // so the product name lives in exactly one place.
  description:
    "A digital marketing agency for founders without a marketing team. A real person on your account, AI doing the legwork: websites, SEO, ads, social and content, at a fraction of agency prices. Book a free call.",
  alternates: { canonical: "/" },
};

/*
 * The homepage, for the founder with no marketing team.
 *
 * The person this is written for may not have a website yet, has never hired
 * an agency, and will not hand their business to software they have never
 * heard of. So the first thing on the page is a person to talk to, the second
 * is what they would get, and the AI is the reason it is affordable rather
 * than the thing being sold. The free tools are still here, one section down,
 * for anyone who wants to look before they talk.
 */

const FAQ = [
  {
    q: "Is this a person or an AI?",
    a: "Both, on purpose. A real person from our team looks after your account: they get to know your business on a call, set everything up with you, check the work and answer when you ask. Behind them, an AI team does the legwork, like research, writing drafts, fixing your site and building reports. That split is why we cost a fraction of a traditional agency.",
  },
  {
    q: "I don't have a website yet. Can you help?",
    a: "Yes, that's where a lot of our clients start. We build it with you, on a platform you own, with the SEO done properly from the first day. Then, if you want, we look after the marketing that brings people to it.",
  },
  {
    q: "Do I have to use any tools or dashboards?",
    a: "No. Your person does the setup and the work. You get a dashboard where you can see everything that's been done and approve what's next, and you can open it whenever you like. If you'd rather do some things yourself, the same tools are yours to use.",
  },
  {
    q: "Can I hire you for just one thing?",
    a: "Yes. A website, just SEO, just ads, just social, or all of it. You pay for what you pick, and you can add or drop a service month to month.",
  },
  {
    q: "Does anything go live without me knowing?",
    a: "No. Every change to your website, every post and every ad waits for your yes. Ads are built paused and only spend once you say go.",
  },
  {
    q: "What happens if I stop?",
    a: "Everything we built is yours. Your website, your accounts, your content and every fix stay with you. No lock-in and no exit fee.",
  },
];

export default function Home() {
  return (
    <MarketingChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }} />

      {/* 1. The promise, and a person to talk to. */}
      <section className="section fresh-hero seat-room">
        <div className="hero-stickers" aria-hidden="true">
          <span className="sticker s1" data-desk="search">A real person &#10003;</span>
          <span className="sticker s2" data-desk="content">Websites built &#128295;</span>
          <span className="sticker s3" data-desk="social">Socials, sorted</span>
          <span className="sticker s4" data-desk="paid">Ads that pay &#128184;</span>
          <span className="sticker s5">AI does the legwork</span>
        </div>
        <h1 className="hero-title">
          A real <span data-sprig-seat="">marketing</span> team, at <span className="hl">AI</span> prices.
        </h1>
        <p className="hero-lede">
          For founders without a marketing team. A person looks after your website, SEO, ads, socials and content.
          AI does the legwork, so it costs a fraction of an agency.
        </p>
        <div className="hero-actions">
          <Link href={BOOK.href} className="big-button primary">{BOOK.label} &rarr;</Link>
          <Link href="/app/new" className="big-button">Check my website free</Link>
        </div>
        <p className="hero-status">
          <span className="dot" aria-hidden="true" />
          <span><b>30 minutes, no obligation.</b> You leave with a plan whether or not you hire us.</span>
        </p>
      </section>

      {/* 2. Where the founder is starting from. */}
      <section className="section section-alt">
        <h2 className="section-title">Wherever you&rsquo;re starting from.</h2>
        <div className="steps3 plain" style={{ marginTop: "1.6rem" }}>
          <Link href="/websites" className="start-card">
            <h3>&ldquo;We don&rsquo;t have a website yet.&rdquo;</h3>
            <p>We build one with you, on a platform you own, set up to be found from day one.</p>
            <span className="tc-go">Websites &rarr;</span>
          </Link>
          <Link href="/seo" className="start-card">
            <h3>&ldquo;We have one. Nobody finds it.&rdquo;</h3>
            <p>We fix what&rsquo;s holding it back on Google and in AI answers, and write what&rsquo;s missing.</p>
            <span className="tc-go">SEO and content &rarr;</span>
          </Link>
          <Link href="/paid" className="start-card">
            <h3>&ldquo;We&rsquo;re ready to grow.&rdquo;</h3>
            <p>Ads that only spend what we can measure, and socials based on what&rsquo;s actually working.</p>
            <span className="tc-go">Ads and social &rarr;</span>
          </Link>
        </div>
      </section>

      {/* 3. How working with us goes. */}
      <section className="section">
        <h2 className="section-title">How it works.</h2>
        <p className="section-lede">A person at every step. The AI does the heavy lifting in between.</p>
        <div className="steps3 four" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>A free call</h3>
            <p>Thirty minutes to understand your business, your customers and your budget. You leave with a plan.</p>
          </div>
          <div>
            <h3>We set it up with you</h3>
            <p>Your person connects your website, Google and ad accounts with you, on a call. No forms, no jargon.</p>
          </div>
          <div>
            <h3>AI does the work, a person checks it</h3>
            <p>Research, fixes, drafts and campaigns, made by our AI team and checked before they reach you.</p>
          </div>
          <div>
            <h3>You say yes, and watch it grow</h3>
            <p>Nothing goes live without your yes. Your dashboard shows every piece of work and what it did.</p>
          </div>
        </div>
      </section>

      {/* 4. The menu. */}
      <section className="section section-alt" id="services">
        <h2 className="section-title">Pick one thing, or all of it.</h2>
        <p className="section-lede">Every service comes with a real person on your account.</p>
        <div className="fresh-desks three" style={{ marginTop: "1.4rem" }}>
          {SERVICES.map((service) => (
            <Link key={service.key} href={service.path} className="fresh-desk" data-desk={service.colour}>
              <span className="fd-name">{service.label}</span>
              <span className="fd-line">{service.line}</span>
              <span className="fd-foot">
                <span className="fd-status">Person included</span>
                <span className="fd-go">Look &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Who does what. */}
      <section className="section">
        <h2 className="section-title">A person up front. AI behind them.</h2>
        <div className="duo" style={{ marginTop: "1.4rem" }}>
          <div className="duo-card person">
            <span className="duo-tag">Your marketing lead</span>
            <h3>A real person, who knows your business</h3>
            <ul>
              <li>Gets to know you on the first call</li>
              <li>Sets up every account with you</li>
              <li>Checks the work before it reaches you</li>
              <li>Walks you through results, in plain English</li>
              <li>Picks up when you need them</li>
            </ul>
          </div>
          <div className="duo-card ai">
            <span className="duo-tag">Your AI team</span>
            <h3>An AI team that never stops working</h3>
            <ul>
              <li>An AI CMO who plans across every service</li>
              <li>A team for each service: SEO, ads, social, content</li>
              <li>Research, fixes, drafts and reports, day and night</li>
              <li>Every number from your real data, or labelled as not measured</li>
              <li>Answers your questions in your dashboard, any time</li>
            </ul>
          </div>
        </div>
        <p style={{ marginTop: "1.2rem" }}>
          <Link href="/the-firm" className="fresh-btn ghost">Meet the team &rarr;</Link>
        </p>
      </section>

      {/* 6. Why it costs less. */}
      <section className="section section-alt">
        <h2 className="section-title">Why we cost less than an agency.</h2>
        <p className="section-lede">
          At a traditional agency, most of your fee pays for hours of legwork. Ours is done by AI, so you pay for
          the person and the results.
        </p>
        <div className="vgrid" style={{ marginTop: "1.4rem" }}>
          <div className="vg-head">A traditional agency</div>
          <div className="vg-head us">Us</div>
          <div className="vg-them">&pound;2,500 to &pound;15,000 a month</div>
          <div className="vg-us">A fraction of that, quoted on the call</div>
          <div className="vg-them">Juniors doing the legwork, billed by the hour</div>
          <div className="vg-us">AI does the legwork. A person checks it.</div>
          <div className="vg-them">A monthly PDF of problems</div>
          <div className="vg-us">The fixes, made and live, with your yes</div>
          <div className="vg-them">Spends first, explains later</div>
          <div className="vg-us">Won&rsquo;t spend what it can&rsquo;t measure</div>
          <div className="vg-them">Locked in for 12 months</div>
          <div className="vg-us">Month to month. Everything stays yours.</div>
        </div>
      </section>

      {/* 7. For the ones who want to look first. */}
      <section className="section">
        <h2 className="section-title">Want to look before you talk?</h2>
        <p className="section-lede">These are the tools our team works with. Free, no signup, results in seconds.</p>
        <div className="tool-cards" style={{ marginTop: "1.4rem" }}>
          <Link href="/app/new" className="tool-card">
            <span className="tc-emoji" style={{ background: "var(--desk-search)" }} aria-hidden="true">&#128269;</span>
            <h3>Check my website</h3>
            <p>Everything that&rsquo;s holding it back, with the fixes already written.</p>
            <span className="tc-go">Start &rarr;</span>
          </Link>
          <Link href="/tools/social-teardown" className="tool-card">
            <span className="tc-emoji" style={{ background: "var(--desk-social)" }} aria-hidden="true">&#128373;</span>
            <h3>Scout a competitor</h3>
            <p>See which of their posts actually worked, and why.</p>
            <span className="tc-go">Start &rarr;</span>
          </Link>
          <Link href="/tools/ad-budget-check" className="tool-card">
            <span className="tc-emoji" style={{ background: "var(--desk-paid)" }} aria-hidden="true">&#128184;</span>
            <h3>Check my ad budget</h3>
            <p>Is it enough to work? The honest maths, in ten seconds.</p>
            <span className="tc-go">Start &rarr;</span>
          </Link>
          <Link href="/tools/voice-check" className="tool-card">
            <span className="tc-emoji" style={{ background: "var(--desk-content)" }} aria-hidden="true">&#9997;</span>
            <h3>Test my writing</h3>
            <p>Do you sound like you, or like everyone else?</p>
            <span className="tc-go">Start &rarr;</span>
          </Link>
        </div>
      </section>

      {/* 8. The promises. */}
      <section className="section section-alt">
        <h2 className="section-title">Things we&rsquo;ll never do.</h2>
        <div className="never-grid" style={{ marginTop: "1.4rem" }}>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Leave you talking to a bot</strong><span>There&rsquo;s always a person on your account.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Make up a number</strong><span>Every stat is from your real data, or we say it isn&rsquo;t.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Put anything live without your yes</strong><span>Every fix, post and ad waits for you.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Hold your work hostage</strong><span>Stop any time. Your site, accounts and content stay yours.</span></div>
          </div>
        </div>
      </section>

      {/* 9. Questions, folded. */}
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

      {/* 10. The action, again. */}
      <section className="section">
        <div className="cta-band final-cta">
          <h2>Tell us about your business.</h2>
          <p>Thirty minutes with a person. A plan you keep, whether or not you hire us.</p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link href={BOOK.href} className="big-button primary">{BOOK.label}</Link>
          </div>
          <p className="small" style={{ marginTop: "1.2rem" }}>Or see what we&rsquo;d fix on your website first:</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <UrlStart note={false} />
          </div>
        </div>
      </section>
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="rotate" />
    </MarketingChrome>
  );
}
