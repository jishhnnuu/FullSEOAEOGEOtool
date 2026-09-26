import Link from "next/link";

import { BRAND, LAB, LAB_PATH, labPath } from "@/lib/brand";
import { LogoMark } from "@/components/logo";
import { SideSwitch } from "@/components/side-switch";
import { BOOK } from "@/lib/services";

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
      <SideSwitch current="agency" />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}

/**
 * The header. The button on the right is the action: talking to a person.
 * A founder who has never hired an agency wants to know who they would be
 * dealing with before they paste their website into anything, so the call
 * comes first and the free site check sits one click further in.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="wordmark">
          <LogoMark size={30} />
          {BRAND}
        </Link>
        <nav className="site-nav">
          <Link href="/websites" className="hide-sm">Websites</Link>
          <Link href="/seo" className="hide-sm">SEO</Link>
          <Link href="/paid" className="hide-sm">Ads</Link>
          <Link href="/social" className="hide-sm">Social</Link>
          <Link href="/content" className="hide-sm">Content</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/app/signin" className="hide-sm">Client login</Link>
          <Link href={BOOK.href} className="cta">{BOOK.label}</Link>
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
            <LogoMark size={26} />
            {BRAND}
          </div>
          <p className="small muted" style={{ maxWidth: "28ch" }}>
            A marketing agency run by people, powered by AI. Built for founders without a marketing team.
          </p>
        </div>
        <div>
          <h4>Services</h4>
          <Link href="/websites">Websites</Link>
          <Link href="/seo">SEO</Link>
          <Link href="/paid">Paid ads</Link>
          <Link href="/social">Social media</Link>
          <Link href="/content">Content</Link>
          <Link href="/the-whole-agency">Everything</Link>
        </div>
        <div>
          <h4>Do it yourself</h4>
          <Link href={LAB_PATH}>{LAB}, our tools</Link>
          <Link href={labPath("seo")}>SEO</Link>
          <Link href={labPath("content")}>Content</Link>
          <Link href={labPath("social")}>Social</Link>
          <Link href={labPath("ads")}>Ads</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link href={BOOK.href}>{BOOK.label}</Link>
          <Link href="/how-it-works">How we work</Link>
          <Link href="/the-firm">The team</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/vs">Us vs a traditional agency</Link>
          <Link href="/inside">Look inside the dashboard</Link>
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
        <span>&copy; {BRAND}. Real people, with an unreasonable number of checks.</span>
        <span>Websites, SEO, AI search, content, social and paid ads.</span>
      </div>
    </footer>
  );
}

/**
 * The closing band on every page: one line, one action. By default that
 * action is a call with a person, and the lab is the quieter second option
 * for someone who would rather do it themselves.
 */
export function CtaBand({
  title = "Tell us about your business.",
  body = "Thirty minutes with a specialist. You leave with a plan, whether or not you hire us.",
  primary = BOOK,
  secondary = { href: LAB_PATH, label: `Or try it yourself in ${LAB}` },
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
