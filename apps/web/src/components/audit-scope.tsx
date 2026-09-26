import Link from "next/link";

/**
 * What the free check is, and what it cannot see.
 *
 * It is the look an SEO agency takes before a discovery call: everything that
 * is public. It is not the audit an agency does once it has the client's
 * accounts, and the difference is stated where the check starts and where the
 * results are read, never in small print somewhere else. Every sentence here
 * describes what the engine actually does: it fetches the HTML a server sends
 * without running JavaScript, reads up to 40 pages on the free check, and
 * times our own requests rather than real visitors.
 */
export function AuditScope({ compact = false }: { compact?: boolean }) {
  return (
    <div className="notice" style={{ marginBottom: "1rem" }}>
      <strong className="small" style={{ display: "block", marginBottom: "0.25rem" }}>
        This is an overview, not a full audit
      </strong>
      <span className="small">
        It&rsquo;s the first look an SEO agency takes before a discovery call: it reads only what anyone can see in
        public.{compact ? " " : <br />}
        Once Google Search Console and Analytics are connected, the picture gets fuller and some findings may change.
      </span>
      <details className="acc" style={{ marginTop: "0.6rem", borderTop: 0 }}>
        <summary className="small">What it can and can&rsquo;t see</summary>
        <div className="acc-body small">
          <p>
            <strong>It reads:</strong> the website&rsquo;s public pages (up to 40 on the free check), its robots.txt and
            sitemaps, titles, headings, text, links, images and structured data, how quickly the server answered our
            requests, and how heavy each page is.
          </p>
          <p>
            <strong>It can&rsquo;t see, until the owner connects their accounts:</strong>
          </p>
          <ul>
            <li>what people search on Google before they find the site, and the clicks and impressions (Search Console)</li>
            <li>which pages Google has actually indexed (Search Console)</li>
            <li>visitors, sales and sign-ups (Google Analytics)</li>
            <li>which other websites link to it (a backlink data source)</li>
            <li>how fast it loads for real visitors on their own phones</li>
          </ul>
          <p>
            <strong>One more difference:</strong> it reads the page your server sends without running JavaScript, the
            way AI assistants&rsquo; crawlers do. Google also runs JavaScript, so a site built mostly in JavaScript can
            look emptier here than it does to Google.
          </p>
          <p style={{ marginBottom: 0 }}>
            Want the full picture? <Link href="/book">Book a free call</Link> and a specialist will go through it with you.
          </p>
        </div>
      </details>
    </div>
  );
}
