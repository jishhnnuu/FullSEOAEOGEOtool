import Link from "next/link";

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
          SEO OS
        </Link>
        <nav className="site-nav">
          <Link href="/platform" className="hide-sm">Platform</Link>
          <Link href="/ai-search" className="hide-sm">AI search</Link>
          <Link href="/how-it-works" className="hide-sm">How it works</Link>
          <Link href="/vs-agency" className="hide-sm">Vs an agency</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/app/signin">Sign in</Link>
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
            SEO OS
          </div>
          <p className="small muted" style={{ maxWidth: "30ch" }}>
            The work an agency does, done by software you can watch, question and stop.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <Link href="/platform">What it does</Link>
          <Link href="/ai-search">AI answer visibility</Link>
          <Link href="/how-it-works">How a run works</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <h4>Compare</h4>
          <Link href="/vs-agency">Against an agency</Link>
          <Link href="/vs-agency#tools">Against audit tools</Link>
          <Link href="/vs-agency#autowriters">Against AI writers</Link>
        </div>
        <div>
          <h4>Trust</h4>
          <Link href="/security">Security and data</Link>
          <Link href="/security#standalone">Runs without us</Link>
          <a href="https://github.com/jishhnnuu/fullseoaeogeotool" target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </div>
        <div>
          <h4>Start</h4>
          <Link href="/app/new">Audit a site</Link>
          <Link href="/app/signin">Sign in</Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>SEO OS. Self-hostable, open source, and usable without an account.</span>
        <span>Search, answer engines and generative engines: SEO, AEO and GEO.</span>
      </div>
    </footer>
  );
}

export function CtaBand({
  title = "Audit a real site in about a minute",
  body = "No account, no card, no connections. Enter an address and watch the crawl run. You keep everything it produces.",
  primary = { href: "/app/new", label: "Run a free audit" },
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
