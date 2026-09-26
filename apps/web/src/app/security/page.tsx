import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";

export const metadata = {
  title: "Security, data and independence",
  description:
    "Where your data lives, how credentials are handled, what the crawler will and will not fetch, and why the platform keeps working with no connection to us at all.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <MarketingChrome>
      <section className="section fresh-hero">
        <div className="eyebrow"><span className="dot" aria-hidden="true" />Trust</div>
        <h1 className="hero-title">Your data. <span className="hl">Your</span> rules.</h1>
        <p className="hero-lede">Short version: the audit runs in your browser, keys are never stored, and it all works without us.</p>
        <div className="hero-actions">
          <Link href="/thymelab/seo/audit" className="big-button primary">Try it, nothing to sign &rarr;</Link>
        </div>
      </section>

      <section className="section section-tight">
        <div className="never-grid">
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>We never store your AI key</strong><span>It rides along with one request, then it&rsquo;s gone.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>We never show a secret back</strong><span>Not even masked. Connections are sealed, full stop.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>We never keep a password</strong><span>Google or an email link. Nothing to leak.</span></div>
          </div>
          <div>
            <span className="x" aria-hidden="true">&times;</span>
            <div><strong>We never email from our domain</strong><span>Outreach goes from your own address, or opens in your own mail app.</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">The detail, for the careful.</h2>
        <div style={{ marginTop: "1.2rem" }}>
          <details className="acc">
            <summary>The browser is the working copy</summary>
            <div className="acc-body">
              <p>
              Sites, runs, findings and drafts are produced in this browser and held in its local storage. That
              stays true with an account: signing in adds a copy on the server so the work follows you to another
              machine, it does not move the work off your machine. Without an account nothing of yours is on our
              side at all, and the audit still runs.
            </p>
            </div>
          </details>
          <details className="acc">
            <summary>A model key is never stored. A connection is sealed.</summary>
            <div className="acc-body">
              <p>
              A model key you add is held in your browser and sent with the one request that uses it. It is never
              logged, never cached, never written down. A connection you approve is different, because a token
              that renews itself is the only way work can happen while your browser is closed: those are envelope
              encrypted, a per-record data key sealed by the deployment master key, so the master key rotates
              without rewriting a single ciphertext and a stolen database row is useless on its own. No route in
              the product returns a stored secret in any form, including a masked one.
            </p>
            </div>
          </details>
          <details className="acc">
            <summary>No password, and no session to steal from the database</summary>
            <div className="acc-body">
              <p>
              Sign-in is Google or a one-time link by email, so there is no password here to leak or reuse. The
              session cookie holds a random value and the database holds only its hash, which means a copy of the
              database cannot be replayed as a login. Disconnecting a Google account hands the grant back to
              Google rather than only dropping our copy of it.
            </p>
            </div>
          </details>
          <details className="acc">
            <summary>The crawler refuses more than it fetches</summary>
            <div className="acc-body">
              <p>
              Loopback, private ranges, link-local, carrier-grade NAT, multicast, cloud metadata endpoints,
              internal hostname suffixes and non-standard ports are all blocked, and the check is repeated after
              every redirect rather than once at the start. robots.txt is honoured with the same longest-match
              rule a real crawler uses.
            </p>
            </div>
          </details>
          <details className="acc">
            <summary>Cross-tenant reads return 404, not 403</summary>
            <div className="acc-body">
              <p>
              In the server deployment, every scoped read goes through one function that filters by tenant. A
              forbidden read answers 404 on purpose: 403 confirms the row exists, and that is an information leak.
            </p>
            </div>
          </details>
          <details className="acc">
            <summary>Email leaves your domain, never ours</summary>
            <div className="acc-body">
              <p>
              On this site, outreach is drafted here and opens in your own mail client with the fields filled in, and
              you press send. On a server installation you can connect your own mail account instead, under a
              per-domain daily cap. A shared platform sending domain gets burned by somebody else&apos;s campaign and
              takes your deliverability with it.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>Everything is traceable</summary>
            <div className="acc-body">
              <p>
              Every run, every step, every generated artefact and every approval is recorded with who or what
              proposed it and who accepted it. You can open the trace behind any number on any screen.
            </p>
            </div>
          </details>
        </div>
      </section>

      <section className="section section-alt" id="standalone">
        <div>
          <h2 className="section-title">Works without us. Really.</h2>
          <p className="section-lede">
            Disconnect everything, remove every key, and the audit still runs and still writes the fixes.
          </p>
          <details className="acc">
            <summary>What needs what</summary>
            <div className="acc-body" style={{ maxWidth: "none" }}>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Capability</th><th>What it needs</th></tr></thead>
              <tbody>
                <tr>
                  <td>Crawl, the full check catalogue, scoring</td>
                  <td className="muted">Nothing. No model, no data vendor, no key.</td>
                </tr>
                <tr>
                  <td>Generated fixes: titles, meta, schema, sitemap, robots, llms.txt, link plans, alt text</td>
                  <td className="muted">Nothing. All derived from your own pages.</td>
                </tr>
                <tr>
                  <td>Keyword model, content gaps, briefs, outlines, FAQ sets</td>
                  <td className="muted">Nothing. Derived with tf-idf over your own content.</td>
                </tr>
                <tr>
                  <td>Long-form drafting</td>
                  <td className="muted">Your own key, with whichever provider you choose. Anthropic, OpenAI, Google or any OpenAI-compatible endpoint, including one you host.</td>
                </tr>
                <tr>
                  <td>Real query data, rank tracking, backlink index</td>
                  <td className="muted">Your own Search Console, and optionally a data provider you pay directly.</td>
                </tr>
                <tr>
                  <td>Publishing</td>
                  <td className="muted">Your own CMS credentials, or a webhook you control.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="notice notice-ok" style={{ marginTop: "1.3rem", maxWidth: "72ch" }}>
            <p style={{ margin: 0 }}>
              <strong>The test that matters:</strong> disconnect every account, remove every key, and the audit
              still runs end to end and still produces work. That is by design, and it is the difference between a
              platform and a wrapper.
            </p>
          </div>
            </div>
          </details>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Or host it yourself.</h2>
        <p className="section-lede">
          One repository, one Docker Compose file. Nothing in it phones home, and none of it needs an account with us.
        </p>
        <pre className="codeblock" style={{ maxWidth: "62ch" }}>{`git clone https://github.com/jishhnnuu/fullseoaeogeotool
cd fullseoaeogeotool
make install
make keygen        # your own encryption keys
make demo          # seed a tenant and audit a real site
make docker        # the whole stack with Postgres`}</pre>
      </section>

      <CtaBand
        title="Questions about your data?"
        body="Ask a specialist on a free call, or try the free check. Nothing to sign, and nothing of yours left behind."
      />
    </MarketingChrome>
  );
}
