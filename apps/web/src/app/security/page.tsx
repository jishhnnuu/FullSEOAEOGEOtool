import { CtaBand, MarketingChrome } from "@/components/marketing";

export const metadata = {
  title: "Security, data and independence",
  description:
    "Where your data lives, how credentials are handled, what the crawler will and will not fetch, and why the platform keeps working with no connection to us at all.",
};

export default function SecurityPage() {
  return (
    <MarketingChrome>
      <section className="section">
        <div className="eyebrow">Trust</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          What happens to your data, stated plainly.
        </h1>
        <p className="section-lede">
          Most of this page is about what does not happen. That is the point of it.
        </p>
      </section>

      <section className="section section-tight">
        <div className="feature-grid">
          <div className="feature">
            <span className="tag">Storage</span>
            <h3>Your workspace is in your browser</h3>
            <p>
              On the hosted app, sites, runs, findings, drafts and settings are held in this browser&apos;s local
              storage. The server that renders the app is stateless: it fetches and parses pages on request and
              keeps none of it. Export and import are built in, because that is the trade you are making.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Credentials</span>
            <h3>Keys are never stored on our side</h3>
            <p>
              A model key you add is held in your browser and sent with the one request that uses it. It is never
              logged, never cached and never written to a server. In a self-hosted installation, credentials are
              envelope encrypted: a per-record data key sealed by the deployment master key, so rotating the
              master key does not require rewriting every ciphertext.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Crawling</span>
            <h3>The crawler refuses more than it fetches</h3>
            <p>
              Loopback, private ranges, link-local, carrier-grade NAT, multicast, cloud metadata endpoints,
              internal hostname suffixes and non-standard ports are all blocked, and the check is repeated after
              every redirect rather than once at the start. robots.txt is honoured with the same longest-match
              rule a real crawler uses.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Tenancy</span>
            <h3>Cross-tenant reads return 404, not 403</h3>
            <p>
              In the server deployment, every scoped read goes through one function that filters by tenant. A
              forbidden read answers 404 on purpose: 403 confirms the row exists, and that is an information leak.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Outreach</span>
            <h3>Email leaves your domain, not ours</h3>
            <p>
              Outreach is sent through your own SMTP or provider, under a per-domain daily cap. A shared platform
              sending domain gets burned by somebody else&apos;s campaign and takes your deliverability with it.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Record</span>
            <h3>Everything is traceable</h3>
            <p>
              Every run, every step, every generated artefact and every approval is recorded with who or what
              proposed it and who accepted it. You can open the trace behind any number on any screen.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="standalone">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">Independence</div>
          <h2 className="section-title">It runs without us, and without any AI vendor.</h2>
          <p className="section-lede">
            This matters more than it sounds. A tool that stops working when a vendor changes a policy is not
            infrastructure, it is a subscription with extra steps.
          </p>
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
      </section>

      <section className="section">
        <div className="eyebrow">Self hosting</div>
        <h2 className="section-title">Or run the whole thing yourself.</h2>
        <p className="section-lede">
          The full platform is one repository: a FastAPI service, a mission worker, Postgres, the agent runtime and
          this dashboard. Docker Compose brings it up. Nothing in it reports to an external service, and no part of
          it requires an account with us.
        </p>
        <pre className="codeblock" style={{ maxWidth: "62ch" }}>{`git clone https://github.com/jishhnnuu/fullseoaeogeotool
cd fullseoaeogeotool
make install
make keygen        # your own encryption keys
make demo          # seed a tenant and audit a real site
make docker        # the whole stack with Postgres`}</pre>
      </section>

      <CtaBand
        title="Run it against a site you own"
        body="Nothing is asked for up front. If you do not like what you see, close the tab and nothing of yours is left behind."
      />
    </MarketingChrome>
  );
}
