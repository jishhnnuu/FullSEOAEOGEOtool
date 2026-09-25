import Link from "next/link";

import { MarketingChrome } from "@/components/marketing";
import { UrlStart } from "@/components/url-start";
import { CATALOG_SIZE } from "@/engine/catalog";
import { DESKS, managerFor } from "@/lib/desks";
import { headcount } from "@/lib/org";
import { PLANS, priceLabel } from "@/lib/plans";
import { faqNode, graph } from "@/lib/schema";

export const metadata = {
  // The homepage keeps the layout's default title rather than restating it,
  // so the product name lives in exactly one place.
  description: `${headcount()} AI marketers fix your SEO, write your content, plan your socials and build your ads. You just approve. Free site audit, no signup, about four minutes.`,
  alternates: { canonical: "/" },
};

/*
 * The homepage, rebuilt around one idea: the action goes first.
 *
 * The previous version held the URL box back until section eight of nine, on
 * the theory that a stranger will not hand over a domain to a company they
 * cannot describe yet. The person this site exists for read the whole thing
 * and could not find where the product was. So the box is the hero now, every
 * section is a headline, a line and something to press, and anything longer
 * lives in an accordion. docs/VOICE-AND-LOOK.md has the rules.
 */

const FAQ = [
  {
    q: "Is this actually AI, or a person with a template?",
    a: `It's ${headcount()} AI specialists, each great at one job, run by a CMO you can chat with. Every one of them is listed on our team page, along with the one thing it will never do.`,
  },
  {
    q: "Do I need to know anything about marketing?",
    a: "Nope. You approve things in plain English. We handle the jargon, the tools and the doing.",
  },
  {
    q: "What can it do today, honestly?",
    a: "Search fixes ship straight to your website today. Content plans and writes today. Social and paid research, plan and draft everything today; posting and launching switch on as each platform approves us, and each desk page shows exactly where that stands.",
  },
  {
    q: "What happens if I cancel?",
    a: "Every fix stays live on your site, because it's in your website, not our dashboard. Your drafts are yours. No lock-in, no exit fee.",
  },
  {
    q: "Is my data safe?",
    a: "The free audit runs in your browser and sends us nothing about your site. Anything you connect later is encrypted, and you can disconnect it from the platform's own settings whenever you like.",
  },
];

export default function Home() {
  const n = headcount();

  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: graph(faqNode(FAQ)) }}
      />

      {/* 1. The action, first. */}
      <section className="section fresh-hero">
        {/* Decoration only. Stickers rather than a fake dashboard, because a
            product screenshot on a homepage is a number nobody measured. */}
        <div className="hero-stickers" aria-hidden="true">
          <span className="sticker s1" data-desk="search">SEO, fixed &#10003;</span>
          <span className="sticker s2" data-desk="content">Words people read &#9997;</span>
          <span className="sticker s3" data-desk="social">Socials, sorted</span>
          <span className="sticker s4" data-desk="paid">Ads that pay &#128184;</span>
          <span className="sticker s5">No meetings &#9996;</span>
        </div>
        <div className="eyebrow"><span className="dot" aria-hidden="true" />{n} AI marketers, one inbox</div>
        <h1 className="hero-title">
          The marketing team you <span className="hl">never</span> have to manage.
        </h1>
        <p className="hero-lede">
          We fix your SEO, write your content, plan your socials and build your ads. You just click yes.
        </p>
        <UrlStart />
        <div className="chip-links">
          <span className="label">Or try:</span>
          <Link href="/tools/social-teardown" className="chip-link">Spy on a competitor</Link>
          <Link href="/tools/ad-budget-check" className="chip-link">Check my ad budget</Link>
          <Link href="/tools/voice-check" className="chip-link">Test my writing</Link>
        </div>
      </section>

      {/* 2. What the next four minutes look like. */}
      <section className="section section-alt">
        <h2 className="section-title">Here&rsquo;s your next 4 minutes.</h2>
        <div className="steps3" style={{ marginTop: "1.6rem" }}>
          <div>
            <h3>We read your whole site</h3>
            <p>Every page, {CATALOG_SIZE} checks. Nothing to install.</p>
          </div>
          <div>
            <h3>We write the fixes</h3>
            <p>Not a to-do list. The actual fix, ready to go.</p>
          </div>
          <div>
            <h3>You pick what goes live</h3>
            <p>Click yes. We push it to your site and check it worked.</p>
          </div>
        </div>
      </section>

      {/* 3. The desks. */}
      <section className="section">
        <h2 className="section-title">Four desks. Pick your problem.</h2>
        <p className="section-lede">Every desk tells you exactly what it can do today. No surprises.</p>
        <div className="fresh-desks">
          {DESKS.map((desk) => (
            <Link key={desk.key} href={desk.path} className="fresh-desk" data-desk={desk.key}>
              <span className="fd-count">{managerFor(desk).team.length} specialists</span>
              <span className="fd-name">{desk.label}</span>
              <span className="fd-line">{desk.tagline}</span>
              <span className="fd-foot">
                <span className="fd-status">{desk.ready.label}</span>
                <span className="fd-go">Meet them &rarr;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. The CMO. */}
      <section className="section section-alt">
        <div className="cmo-preview">
          <div>
            <div className="eyebrow">Meet your CMO</div>
            <h2 className="section-title">One person to talk to. That&rsquo;s it.</h2>
            <p className="section-lede">
              Ask anything in plain English, or just talk: it listens. Your CMO runs every desk and tells you the
              truth, even when it&rsquo;s awkward.
            </p>
            <Link href="/app/new" className="big-button primary">Try it on my site</Link>
          </div>
          <div className="chat-mock" aria-label="An example conversation with the CMO">
            <span className="label">Example chat. Yours uses your real numbers.</span>
            <div className="bubble me">Be honest. How bad is my site?</div>
            <div className="bubble them">
              <span className="who">Your CMO</span>
              Not bad, not great. 36 things to fix, and I&rsquo;ve already written 24 of the fixes.
            </div>
            <div className="bubble me">What do I do first?</div>
            <div className="bubble them">
              <span className="who">Your CMO</span>
              Approve the page titles. One click, and it&rsquo;s your biggest win this week.
            </div>
          </div>
        </div>
      </section>

      {/* 5. Free tools. */}
      <section className="section">
        <h2 className="section-title">Try before you trust us.</h2>
        <p className="section-lede">Four free tools. No signup. Real results in seconds.</p>
        <div className="tool-cards">
          <Link href="/app/new" className="tool-card">
            <span className="tc-emoji" style={{ background: "var(--desk-search)" }} aria-hidden="true">&#128269;</span>
            <h3>Audit my site</h3>
            <p>Everything that&rsquo;s broken, with the fixes already written.</p>
            <span className="tc-go">Start &rarr;</span>
          </Link>
          <Link href="/tools/social-teardown" className="tool-card">
            <span className="tc-emoji" style={{ background: "var(--desk-social)" }} aria-hidden="true">&#128373;</span>
            <h3>Spy on a competitor</h3>
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

      {/* 6. Why people switch. */}
      <section className="section section-alt">
        <h2 className="section-title">Why people ditch their agency.</h2>
        <div className="vgrid" style={{ marginTop: "1.4rem" }}>
          <div className="vg-head">A typical agency</div>
          <div className="vg-head us">Us</div>
          <div className="vg-them">&pound;2,500+ a month</div>
          <div className="vg-us">From {priceLabel(PLANS.starter)} a month</div>
          <div className="vg-them">A PDF of problems</div>
          <div className="vg-us">The fixes, ready to ship</div>
          <div className="vg-them">&ldquo;Let&rsquo;s jump on a call&rdquo;</div>
          <div className="vg-us">No calls. No meetings.</div>
          <div className="vg-them">Spends first, explains later</div>
          <div className="vg-us">Won&rsquo;t spend what it can&rsquo;t measure</div>
          <div className="vg-them">Locked in for 12 months</div>
          <div className="vg-us">Cancel anytime, keep every fix</div>
        </div>
      </section>

      {/* 7. Price, visible. */}
      <section className="section">
        <h2 className="section-title">Prices you can actually see.</h2>
        <div className="price-pills" style={{ marginTop: "1.4rem" }}>
          <div className="price-pill">
            <span className="pp-name">The audit</span>
            <span className="pp-amt">{priceLabel(PLANS.free)}</span>
            <span className="pp-per">forever</span>
            <span className="pp-line">Every check, every fix written.</span>
          </div>
          <div className="price-pill">
            <span className="pp-name">{PLANS.starter.name}</span>
            <span className="pp-amt">{priceLabel(PLANS.starter)}</span>
            <span className="pp-per">per site, per month</span>
            <span className="pp-line">The search desk. Fixes shipped for you.</span>
          </div>
          <div className="price-pill star">
            <span className="pp-name">{PLANS.growth.name} &middot; most popular</span>
            <span className="pp-amt">{priceLabel(PLANS.growth)}</span>
            <span className="pp-per">per site, per month</span>
            <span className="pp-line">Every desk. The whole team.</span>
          </div>
        </div>
        <p style={{ marginTop: "1.2rem" }}>
          <Link href="/pricing" className="fresh-btn ghost">See every plan &rarr;</Link>
        </p>
      </section>

      {/* 8. The promises. */}
      <section className="section section-alt">
        <h2 className="section-title">Things we&rsquo;ll never do.</h2>
        <div className="never-grid" style={{ marginTop: "1.4rem" }}>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Make up a number</strong><span>Every stat is from your real data, or we say it isn&rsquo;t.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Waste your ad budget</strong><span>No working tracking, no spending. Simple as that.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Hide the price</strong><span>One site? The price is right up there. No sales call.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>Hold your work hostage</strong><span>Cancel and every fix stays live on your site.</span></div>
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
          <h2>Go on. Paste your URL.</h2>
          <p>Four minutes from now you&rsquo;ll know exactly what to fix. Free, no signup.</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <UrlStart note={false} />
          </div>
        </div>
      </section>
    </MarketingChrome>
  );
}
