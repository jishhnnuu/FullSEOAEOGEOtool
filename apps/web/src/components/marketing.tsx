import Link from "next/link";

import { BRAND } from "@/lib/brand";

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

/**
 * The header. The button on the right is the action, not a tour: it starts
 * an audit. Everything else is one word, because a nav bar is not a place to
 * explain anything.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="wordmark">
          <span className="dot" aria-hidden="true" />
          {BRAND}
        </Link>
        <nav className="site-nav">
          <Link href="/seo" className="hide-sm">Search</Link>
          <Link href="/content" className="hide-sm">Content</Link>
          <Link href="/social" className="hide-sm">Social</Link>
          <Link href="/paid" className="hide-sm">Paid</Link>
          <Link href="/tools" className="hide-sm">Free tools</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/app/signin" className="hide-sm">Sign in</Link>
          <Link href="/app/new" className="cta">Audit my site</Link>
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
          <p className="small muted" style={{ maxWidth: "28ch" }}>
            Your AI marketing team. One inbox. No meetings.
          </p>
        </div>
        <div>
          <h4>Desks</h4>
          <Link href="/seo">Search</Link>
          <Link href="/content">Content</Link>
          <Link href="/social">Social</Link>
          <Link href="/paid">Paid ads</Link>
          <Link href="/the-whole-agency">All of them</Link>
        </div>
        <div>
          <h4>Free tools</h4>
          <Link href="/app/new">Audit my site</Link>
          <Link href="/tools/social-teardown">Scout a competitor</Link>
          <Link href="/tools/ad-budget-check">Check my ad budget</Link>
          <Link href="/tools/voice-check">Test my writing</Link>
          <Link href="/tools">All tools</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link href="/the-firm">The team</Link>
          <Link href="/inside">Look inside</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/vs">Us vs an agency</Link>
          <Link href="/proof">Our own audit</Link>
        </div>
        <div>
          <h4>Learn</h4>
          <Link href="/library">Every check we run</Link>
          <Link href="/glossary">Glossary</Link>
          <Link href="/compare">Compare tools</Link>
          <Link href="/ai-search">AI search</Link>
        </div>
        <div>
          <h4>Legal</h4>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>&copy; {BRAND}. Made with an unreasonable number of checks.</span>
        <span>SEO, AEO, GEO, content, social and paid.</span>
      </div>
    </footer>
  );
}

/**
 * The closing band on every page: one line, one action.
 */
export function CtaBand({
  title = "Ready when you are.",
  body = "Paste your URL and see what we'd fix. Free, no signup, about four minutes.",
  primary = { href: "/app/new", label: "Audit my site free" },
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
          <Link href={primary.href} className="big-button primary">{primary.label}</Link>
          {secondary && (
            <Link href={secondary.href} className="big-button">{secondary.label}</Link>
          )}
        </div>
      </div>
    </section>
  );
}
