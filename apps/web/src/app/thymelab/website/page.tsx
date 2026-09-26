import Link from "next/link";

import { LabBuddy } from "@/components/crew/scenes";
import { Waitlist } from "@/components/lab/waitlist";
import { labPath } from "@/lib/brand";

export const metadata = {
  title: "The website lab: build your own website, coming soon",
  description:
    "Thymelab's website builder is in the works: build and host your own website, set up to be found on Google from day one. Join the list to hear when it opens.",
  alternates: { canonical: "/thymelab/website" },
};

/*
 * Not built yet, and the page says so in the first line. What exists today
 * is the list, and the agency, which builds websites now.
 */
export default function LabWebsite() {
  return (
    <div className="tone-website">
      <section className="lab-section lab-hero">
        <div>
          <span className="lab-eyebrow">Exp 05 / The website lab &middot; in the works</span>
          <h1 className="lab-title">
            Build your own website. <span className="glow">Soon.</span>
          </h1>
          <p className="lab-lede">
            We&rsquo;re building a website lab: describe your business, get a site you can edit, host it, and have it set
            up to be found on Google from the first day. It isn&rsquo;t open yet.
          </p>
          <div style={{ marginTop: "1.6rem", maxWidth: 640 }}>
            <Waitlist />
          </div>
          <p className="lab-muted small" style={{ marginTop: "1rem" }}>
            Need a website now? <Link href="/websites">Our agency builds them</Link>, or run the{" "}
            <Link href={labPath("/seo/audit")}>SEO lab</Link> on the one you have.
          </p>
        </div>
        <LabBuddy tool="website" />
      </section>

      <section className="lab-section">
        <span className="lab-eyebrow">What we&rsquo;re building</span>
        <div className="lab-steps">
          <div className="lab-card">
            <h3>Describe it</h3>
            <p>Tell it what you sell and who buys it. It drafts the pages and the words.</p>
          </div>
          <div className="lab-card">
            <h3>Make it yours</h3>
            <p>Change anything, in plain English or by clicking. No code.</p>
          </div>
          <div className="lab-card">
            <h3>Launch it, found</h3>
            <p>Hosted, fast, and checked by the SEO lab before anyone sees it.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
