import Link from "next/link";

import { BRAND } from "@/lib/brand";
import { headcount } from "@/lib/org";

/**
 * The public site's chrome.
 *
 * A route group would give every marketing page this layout for free, but it
 * puts parentheses into the built asset paths, and enough CDNs and proxies
 * mishandle those to make it not worth the saved lines. Each page wraps itself
 * instead.
 */
export function MarketingChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}

/** The public site's header. Nothing here is behind a sign-in. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="wordmark">
          <span className="dot" aria-hidden="true" />
          {BRAND}
        </Link>
        {/* Ordered by what a stranger is choosing between, not by what we built first. */}
        <nav className="site-nav">
          <Link href="/seo" className="hide-sm">Search</Link>
          <Link href="/content" className="hide-sm">Content</Link>
          <Link href="/social" className="hide-sm">Social</Link>
          <Link href="/tools" className="hide-sm">Free tools</Link>
          <Link href="/the-firm" className="hide-sm">The firm</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/app/signin">Sign in</Link>
          <Link href="/inside" className="cta">Look inside</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <div className="wordmark" style={{ marginBottom: "0.6rem" }}>
            <span className="dot" aria-hidden="true" />
            {BRAND}
          </div>
          <p className="small muted" style={{ maxWidth: "30ch" }}>
            Everything an agency does, done by specialists you can watch, question and stop.
          </p>
        </div>
        <div>
          <h4>The desks</h4>
          <Link href="/seo">Search</Link>
          <Link href="/content">Content</Link>
          <Link href="/paid">Paid ads</Link>
          <Link href="/social">Social</Link>
          <Link href="/the-whole-agency">Every desk, one plan</Link>
        </div>
        <div>
          <h4>The firm</h4>
          <Link href="/the-firm">All {headcount()} specialists</Link>
          <Link href="/inside">Look inside a live account</Link>
          <Link href="/how-it-works">How a run works</Link>
          <Link href="/platform">Every capability</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <h4>Compare</h4>
          <Link href="/vs">Against an agency</Link>
          <Link href="/vs/seo-agency">Vs an SEO agency</Link>
          <Link href="/vs/content-agency">Vs a content agency</Link>
          <Link href="/compare">Against other tools</Link>
          <Link href="/compare/semrush">Vs Semrush</Link>
        </div>
        <div>
          <h4>Run something now</h4>
          <Link href="/tools/social-teardown">Tear down a competitor</Link>
          <Link href="/tools/voice-check">Check a page against its rivals</Link>
          <Link href="/tools">All free tools</Link>
          <Link href="/app/new">Audit your own site</Link>
        </div>
        <div>
          <h4>Learn</h4>
          <Link href="/library">The check library</Link>
          <Link href="/glossary">Glossary</Link>
          <Link href="/ai-crawlers-and-javascript">AI crawlers and JavaScript</Link>
          <Link href="/research/ai-crawler-access">The 100-site study</Link>
          <Link href="/proof">Our own audit</Link>
        </div>
        <div>
          <h4>Trust</h4>
          <Link href="/security">Security and data</Link>
          <Link href="/security#standalone">Runs without us</Link>
          <Link href="/proof">Our own audit, in public</Link>
          <a href="https://github.com/jishhnnuu/fullseoaeogeotool" target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </div>
        <div>
          <h4>Start</h4>
          <Link href="/inside">Look inside a live account</Link>
          <Link href="/app/new">See what we would fix</Link>
          <Link href="/app/signin">Sign in</Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>{BRAND}. Self-hostable, open source, and usable without an account.</span>
        <span>Search, answer engines and generative engines: SEO, AEO and GEO.</span>
      </div>
    </footer>
  );
}

export function CtaBand({
  title = "See what we would fix on your site this week",
  body = "No account, no card, no connections. Enter an address and watch the crawl run. You keep everything it produces.",
  primary = { href: "/app/new", label: "See what we would fix this week" },
  secondary,
}: {
  title?: string;
  body?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="section section-tight">
      <div className="cta-band">
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}>
          <Link href={primary.href} className="button primary big-button">{primary.label}</Link>
          {secondary && (
            <Link href={secondary.href} className="button big-button">{secondary.label}</Link>
          )}
        </div>
      </div>
    </section>
  );
}
