import Link from "next/link";

import { RoundTable } from "@/components/crew/scenes";
import { MarketingChrome } from "@/components/marketing";
import { SampleWork } from "@/components/sample-work";
import { LAB, LAB_PATH } from "@/lib/brand";
import { BOOK, SERVICES } from "@/lib/services";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  // The homepage keeps the layout's default title rather than restating it,
  // so the product name lives in exactly one place.
  description:
    "An AI-powered marketing agency for founders without a marketing team. AI does the legwork on your website, SEO, ads, social and content, a specialist oversees every piece, and it costs a fraction of a traditional agency. Book a free call.",
  alternates: { canonical: "/" },
};

/*
 * The homepage, for the founder with no marketing team.
 *
 * The person this is written for may not have a website yet, has never hired
 * an agency, and will not hand their business to software they have never
 * heard of. So the first thing on the page is a specialist to talk to, the second
 * is what they would get, and the AI is the reason it is affordable rather
 * than the thing being sold. The do-it-yourself tools live on their own side
 * of the site, Thymelab, and this page points there exactly once in the hero
 * and once in a band further down, so nobody mistakes the agency for software.
 */

const FAQ = [
  {
    q: "Is this AI, or a real specialist?",
    a: "Both, on purpose. A marketing specialist from our team looks after your account: they get to know your business on a call, set everything up with you, check the work and answer when you ask. Behind them, an AI team does the legwork, like research, writing drafts, fixing your site and building reports. That split is why we cost a fraction of a traditional agency.",
  },
  {
    q: "I don't have a website yet. Can you help?",
    a: "Yes, that's where a lot of our clients start. We build it with you, on a platform you own, with the SEO done properly from the first day. Then, if you want, we look after the marketing that brings people to it.",
  },
  {
    q: "Do I have to use any tools or dashboards?",
    a: `No. Your specialist does the setup and the work. You get a dashboard where you can see everything that's been done and approve what's next, and you can open it whenever you like. If you'd rather do some things yourself, the tools our team works with are in ${LAB}, our do-it-yourself lab.`,
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

      {/* 1. The promise, a specialist to talk to, and the team at work. */}
      <section className="section fresh-hero agency-hero">
        <div className="agency-hero-copy">
          <h1 className="hero-title">
            A full marketing team, for <span className="hl">less</span> than an agency.
          </h1>
          <p className="hero-lede">
            An AI-powered marketing agency for founders. AI does the legwork on your website, SEO, ads, social and
            content, and a specialist oversees every piece. You pay a fraction of what a traditional agency charges.
          </p>
          <div className="hero-actions">
            <Link href={BOOK.href} className="big-button primary">{BOOK.label} &rarr;</Link>
            <Link href={LAB_PATH} className="big-button lab-jump">
              Rather do it yourself? Try {LAB}
            </Link>
          </div>
          <p className="hero-status">
            <span className="dot" aria-hidden="true" />
            <span><b>30 minutes, no obligation.</b> You leave with a plan whether or not you hire us.</span>
          </p>
        </div>
        <div className="agency-hero-scene">
          <RoundTable />
        </div>
      </section>

      {/* 2. Who this is for: three kinds of founder, each with where they start. */}
      <section className="section section-alt">
        <h2 className="section-title">Who we help.</h2>
        <p className="section-lede">Most founders come to us from one of three places. Which sounds like you?</p>
        <div className="steps3 plain" style={{ marginTop: "1.6rem" }}>
          <Link href="/websites" className="start-card">
            <span className="start-tag">Just starting out</span>
            <h3>You don&rsquo;t have a website yet</h3>
            <p>We build one with you, on a platform you own, set up to be found on Google from day one.</p>
            <span className="tc-go">Website building &rarr;</span>
          </Link>
          <Link href="/seo" className="start-card">
            <span className="start-tag">Stuck</span>
            <h3>You have a website, but nobody finds it</h3>
            <p>We fix what&rsquo;s holding it back on Google and in AI answers, and write the pages that are missing.</p>
            <span className="tc-go">SEO and content &rarr;</span>
          </Link>
          <Link href="/paid" className="start-card">
            <span className="start-tag">Growing</span>
            <h3>You&rsquo;re ready to grow faster</h3>
            <p>Ads that only spend what we can measure, and social media based on what&rsquo;s actually working.</p>
            <span className="tc-go">Ads and social media &rarr;</span>
          </Link>
        </div>
      </section>

      {/* 3. Judgement: what someone who has done this before does first. */}
      <section className="section">
        <h2 className="section-title">What we do first, and why.</h2>
        <p className="section-lede">
          Most marketing budgets are lost in the order things are done, not in the things themselves. So we start
          where the money is safest.
        </p>
        <div className="judgement" style={{ marginTop: "1.6rem" }}>
          <div>
            <span className="j-num">1</span>
            <h3>Make sure you can be found</h3>
            <p>A website Google can read and people can use. Ads sent to a slow or broken page pay to lose customers.</p>
          </div>
          <div>
            <span className="j-num">2</span>
            <h3>Measure before spending</h3>
            <p>Enquiries and sales tracked properly first. We won&rsquo;t run ads we can&rsquo;t measure, even if you ask.</p>
          </div>
          <div>
            <span className="j-num">3</span>
            <h3>Fix before writing</h3>
            <p>A handful of fixes to pages you already have usually beats ten new blog posts. New content comes next.</p>
          </div>
          <div>
            <span className="j-num">4</span>
            <h3>Grow what&rsquo;s working</h3>
            <p>Social and ads follow what your customers already respond to, not what&rsquo;s fashionable this month.</p>
          </div>
        </div>
      </section>

      {/* 4. How working with us goes. */}
      <section className="section section-alt">
        <h2 className="section-title">How it works.</h2>
        <p className="section-lede">A specialist at every step. AI does the heavy lifting in between.</p>
        <div className="steps3 four" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>A free call</h3>
            <p>Thirty minutes to understand your business, your customers and your budget. You leave with a plan.</p>
          </div>
          <div>
            <h3>We set it up with you</h3>
            <p>Your specialist connects your website, Google and ad accounts with you, on a call. No forms, no jargon.</p>
          </div>
          <div>
            <h3>AI does the work, a specialist checks it</h3>
            <p>Research, fixes, drafts and campaigns, made by our AI team and checked before they reach you.</p>
          </div>
          <div>
            <h3>You say yes, and watch it grow</h3>
            <p>Nothing goes live without your yes. Your dashboard shows every piece of work and what it did.</p>
          </div>
        </div>
      </section>

      {/* 5. The menu. */}
      <section className="section" id="services">
        <h2 className="section-title">Pick one thing, or all of it.</h2>
        <p className="section-lede">Every service is AI-powered, and overseen by a specialist who knows your business.</p>
        <div className="fresh-desks three" style={{ marginTop: "1.4rem" }}>
          {SERVICES.map((service) => (
            <Link key={service.key} href={service.path} className="fresh-desk" data-desk={service.colour}>
              <span className="fd-name">{service.label}</span>
              <span className="fd-line">{service.line}</span>
              <span className="fd-foot">
                <span className="fd-status">AI-powered, specialist-led</span>
                <span className="fd-go">Look &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 6. Who does what. */}
      <section className="section section-alt">
        <h2 className="section-title">A specialist up front. AI behind them.</h2>
        <div className="duo" style={{ marginTop: "1.4rem" }}>
          <div className="duo-card person">
            <span className="duo-tag">Your specialist</span>
            <h3>A marketing specialist who knows your business</h3>
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

      {/* 7. Why it costs less. */}
      <section className="section">
        <h2 className="section-title">Why we cost less than an agency.</h2>
        <p className="section-lede">
          At a traditional agency, most of your fee pays for hours of legwork. Ours is done by AI, so you pay for
          the specialist and the results.
        </p>
        <div className="vgrid" style={{ marginTop: "1.4rem" }}>
          <div className="vg-head">A traditional agency</div>
          <div className="vg-head us">Us</div>
          <div className="vg-them">&pound;2,500 to &pound;15,000 a month</div>
          <div className="vg-us">A fraction of that, quoted on the call</div>
          <div className="vg-them">Juniors doing the legwork, billed by the hour</div>
          <div className="vg-us">AI does the legwork. A specialist checks it.</div>
          <div className="vg-them">A monthly PDF of problems</div>
          <div className="vg-us">The fixes, made and live, with your yes</div>
          <div className="vg-them">Spends first, explains later</div>
          <div className="vg-us">Won&rsquo;t spend what it can&rsquo;t measure</div>
          <div className="vg-them">Locked in for 12 months</div>
          <div className="vg-us">Month to month. Everything stays yours.</div>
        </div>
      </section>

      {/* 8. Examples of the work, drawn for illustration and labelled as such. */}
      <section className="section section-alt">
        <h2 className="section-title">What the work looks like.</h2>
        <p className="section-lede">
          The kind of thing that lands in your dashboard for a yes. These are illustrations with made-up businesses,
          not client results: real work is shown on your own call, with your own numbers.
        </p>
        <SampleWork />
      </section>

      {/* 9. The one door to the do-it-yourself side. */}
      <section className="section">
        <div className="lab-band">
          <div>
            <span className="lab-band-tag">{LAB}</span>
            <h2>Rather do it yourself?</h2>
            <p>
              The tools our team works with are open in {LAB}, our do-it-yourself lab. Audit a website, check an ad
              budget, read a competitor&rsquo;s socials. Free to start, no call needed.
            </p>
          </div>
          <Link href={LAB_PATH} className="big-button">Open {LAB} &rarr;</Link>
        </div>
      </section>

      {/* 10. The promises. */}
      <section className="section section-alt">
        <h2 className="section-title">Things we&rsquo;ll never do.</h2>
        <div className="never-grid" style={{ marginTop: "1.4rem" }}>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Leave you talking to a bot</strong><span>There&rsquo;s always a specialist on your account.</span></div>
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

      {/* 11. Questions, folded. */}
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

      {/* 12. The action, again. */}
      <section className="section">
        <div className="cta-band final-cta">
          <h2>Tell us about your business.</h2>
          <p>Thirty minutes with a specialist. A plan you keep, whether or not you hire us.</p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link href={BOOK.href} className="big-button primary">{BOOK.label}</Link>
          </div>
        </div>
      </section>
    </MarketingChrome>
  );
}
