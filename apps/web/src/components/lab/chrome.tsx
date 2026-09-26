import Link from "next/link";

import { BOOK } from "@/lib/services";
import { LAB, labPath } from "@/lib/brand";
import { LabMark } from "@/components/lab/mark";
import { SideSwitch } from "@/components/side-switch";

/**
 * Thymelab's own chrome: its own header, footer and actions.
 *
 * The lab is sold to a different person from the agency (someone who wants
 * to do it themselves) so nothing here borrows the agency's navigation. The
 * only way back is the switch strip at the top and one line in the footer.
 */
export const LAB_TOOLS = [
  { key: "seo", label: "SEO", path: labPath("/seo") },
  { key: "content", label: "Content", path: labPath("/content") },
  { key: "social", label: "Social", path: labPath("/social") },
  { key: "ads", label: "Ads", path: labPath("/ads") },
  { key: "website", label: "Website", path: labPath("/website") },
] as const;

export function LabChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SideSwitch current="lab" />
      <LabHeader />
      <main className="lab-main">{children}</main>
      <LabFooter />
    </>
  );
}

function LabHeader() {
  return (
    <header className="lab-header">
      <div className="lab-header-inner">
        <Link href={labPath()} className="lab-wordmark">
          <LabMark size={30} />
          <span>
            {LAB.replace(/lab$/i, "")}
            <em>{LAB.match(/lab$/i)?.[0] ?? ""}</em>
          </span>
        </Link>
        <nav className="lab-nav" aria-label={`${LAB} tools`}>
          {LAB_TOOLS.map((tool) => (
            <Link key={tool.key} href={tool.path} className="hide-sm">
              {tool.label}
              {tool.key === "website" ? <sup>soon</sup> : null}
            </Link>
          ))}
          <Link href={labPath("/pricing")} className="hide-sm">Pricing</Link>
          <Link href="/app/signin" className="hide-sm">Sign in</Link>
          <Link href={labPath("/seo/audit")} className="lab-btn small">Start free</Link>
        </nav>
      </div>
    </header>
  );
}

function LabFooter() {
  return (
    <footer className="lab-footer">
      <div className="lab-footer-inner">
        <div>
          <Link href={labPath()} className="lab-wordmark">
            <LabMark size={26} />
            <span>
              {LAB.replace(/lab$/i, "")}
              <em>{LAB.match(/lab$/i)?.[0] ?? ""}</em>
            </span>
          </Link>
          <p className="lab-muted small" style={{ maxWidth: "30ch" }}>
            The do-it-yourself marketing lab. The same tools our agency&rsquo;s specialists use, for you to run.
          </p>
        </div>
        <div>
          <h4>Tools</h4>
          {LAB_TOOLS.map((tool) => (
            <Link key={tool.key} href={tool.path}>{tool.label}</Link>
          ))}
        </div>
        <div>
          <h4>Start</h4>
          <Link href={labPath("/seo/audit")}>Check a website&rsquo;s SEO</Link>
          <Link href={labPath("/social/teardown")}>Scout a competitor</Link>
          <Link href={labPath("/content/voice")}>Test your writing</Link>
          <Link href={labPath("/ads/budget")}>Check an ad budget</Link>
        </div>
        <div>
          <h4>{LAB}</h4>
          <Link href={labPath("/pricing")}>Pricing</Link>
          <Link href={labPath("/seo/checks")}>Quick SEO checks</Link>
          <Link href="/app/signin">Sign in</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <div>
          <h4>Rather not DIY?</h4>
          <Link href="/">Our agency does it for you</Link>
          <Link href={BOOK.href}>{BOOK.label}</Link>
        </div>
      </div>
    </footer>
  );
}

/** The closing band on a lab page. */
export function LabCta({
  title = "Your lab is ready.",
  body = "Free to start. No signup for the first experiment.",
  primary = { href: labPath("/seo/audit"), label: "Start free" },
  secondary,
}: {
  title?: string;
  body?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="lab-section">
      <div className="lab-cta">
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="lab-actions" style={{ justifyContent: "center" }}>
          <Link href={primary.href} className="lab-btn">{primary.label} &rarr;</Link>
          {secondary ? <Link href={secondary.href} className="lab-btn ghost">{secondary.label}</Link> : null}
        </div>
      </div>
    </section>
  );
}
