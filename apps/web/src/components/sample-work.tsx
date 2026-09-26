/*
 * Four pieces of work, drawn as they would arrive in a client's dashboard.
 *
 * Every business here is invented and every card says "Illustration" on it.
 * An agency page full of mock-ups presented as client wins is exactly the
 * kind of invented proof this product refuses elsewhere, so the label is on
 * the card, not in a footnote. Real results get shown on the call, from the
 * visitor's own numbers or not at all.
 */

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="sw-tag">{children}</span>;
}

export function SampleWork() {
  return (
    <div className="sw-grid">
      <figure className="sw-card" data-desk="content">
        <div className="sw-head">
          <Tag>Website build</Tag>
          <span className="sw-illus">Illustration</span>
        </div>
        <div className="sw-browser" aria-hidden="true">
          <div className="sw-chrome">
            <i /><i /><i />
            <span>harbourlanebakery.example</span>
          </div>
          <div className="sw-site">
            <div className="sw-nav">
              <b>Harbour Lane</b>
              <span>Menu</span>
              <span>Visit</span>
              <span className="sw-nav-cta">Order</span>
            </div>
            <div className="sw-site-hero">
              <div>
                <strong>Sourdough, baked before sunrise.</strong>
                <em>Open Tuesday to Sunday, 7am till sold out.</em>
                <span className="sw-site-btn">Order for Saturday</span>
              </div>
              <div className="sw-loaf" />
            </div>
          </div>
        </div>
        <figcaption>
          A homepage built mobile-first: what they sell, when they are open and how to order, all before the first
          scroll. Fast, on a platform the owner keeps.
        </figcaption>
      </figure>

      <figure className="sw-card" data-desk="search">
        <div className="sw-head">
          <Tag>SEO fix</Tag>
          <span className="sw-illus">Illustration</span>
        </div>
        <div className="sw-fix" aria-hidden="true">
          <div className="sw-fix-row">
            <span className="sw-fix-label">Page</span>
            <code>northfieldphysio.example/</code>
          </div>
          <div className="sw-fix-row before">
            <span className="sw-fix-label">Title now</span>
            <code>Home | Northfield</code>
          </div>
          <div className="sw-fix-row after">
            <span className="sw-fix-label">Title after</span>
            <code>Sports Physio in Northfield | Same-Week Appointments</code>
          </div>
          <div className="sw-fix-foot">
            <span className="sw-pill wait">Waiting for your yes</span>
            <span className="sw-fix-note">Checked by your specialist</span>
          </div>
        </div>
        <figcaption>
          The fix written out and ready to go live, not a report telling you to go and find someone to do it.
        </figcaption>
      </figure>

      <figure className="sw-card" data-desk="paid">
        <div className="sw-head">
          <Tag>Search ad</Tag>
          <span className="sw-illus">Illustration</span>
        </div>
        <div className="sw-ad" aria-hidden="true">
          <div className="sw-ad-top">
            <span className="sw-ad-sp">Sponsored</span>
            <span>kestrelcoffee.example</span>
          </div>
          <strong>Fresh-Roasted Coffee, Delivered Weekly</strong>
          <p>Roasted the day before it ships. Pick your beans, skip or pause any week, cancel any time.</p>
          <div className="sw-ad-links">
            <span>Subscriptions</span>
            <span>Single bags</span>
            <span>Gift boxes</span>
          </div>
          <div className="sw-fix-foot">
            <span className="sw-pill paused">Built paused</span>
            <span className="sw-fix-note">Spends only after your yes</span>
          </div>
        </div>
        <figcaption>
          Campaigns are built paused and checked against the plan you agreed. Nothing spends until you say go.
        </figcaption>
      </figure>

      <figure className="sw-card" data-desk="social">
        <div className="sw-head">
          <Tag>Social week</Tag>
          <span className="sw-illus">Illustration</span>
        </div>
        <div className="sw-week" aria-hidden="true">
          {[
            ["Mon", "Reel", "Roast day"],
            ["Tue", "", ""],
            ["Wed", "Slides", "Three brews"],
            ["Thu", "", ""],
            ["Fri", "Post", "Meet a regular"],
            ["Sat", "Story", "New bean"],
            ["Sun", "", ""],
          ].map(([day, kind, title]) => (
            <div key={day} className={`sw-day${kind ? "" : " empty"}`}>
              <span className="sw-day-name">{day}</span>
              {kind ? (
                <span className="sw-post">
                  <b>{kind}</b>
                  {title}
                </span>
              ) : (
                <span className="sw-rest">rest</span>
              )}
            </div>
          ))}
        </div>
        <figcaption>
          A week planned around what already works for the account, drafted and waiting for approval. Rest days are
          on purpose.
        </figcaption>
      </figure>
    </div>
  );
}
