"use client";

import Link from "next/link";
import { useMemo } from "react";

import { NO_TRACKING, measurementReadiness, type TrackingSignals } from "@/engine/ads";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

/*
 * The gate, run against what the crawl actually found.
 *
 * Deliberately not a questionnaire. The commonest way tracking is broken is
 * that somebody believes it works, so every signal here is read from the
 * pages this workspace already fetched. Where a thing genuinely cannot be
 * observed from outside, the page says that rather than assuming the
 * favourable answer.
 */

const GOOGLE_ADS = /googleadservices|googlesyndication|gtag\/js|AW-\d{6,}/i;
const META_PIXEL = /connect\.facebook\.net/i;
const CONSENT = /cookieyes|onetrust|cookiebot|klaro|iubenda|termly|usercentrics|osano|civic.*cookie|consent/i;

export default function PaidReadiness() {
  const { site, result } = useSite();

  const observed = useMemo(() => {
    if (!result) return null;
    const pages = result.crawl?.pages ?? [];
    const analytics = new Set<string>();
    let googleAds = false;
    let metaPixel = false;
    let consent = false;
    let forms = 0;

    for (const page of pages) {
      const s = page.signals;
      if (!s) continue;
      for (const a of s.analytics ?? []) analytics.add(a);
      forms += s.forms ?? 0;
      const haystack = [...(s.scripts ?? [])].join(" ");
      if (GOOGLE_ADS.test(haystack)) googleAds = true;
      if (META_PIXEL.test(haystack)) metaPixel = true;
      if (CONSENT.test(haystack)) consent = true;
    }
    return { analytics: [...analytics], googleAds, metaPixel, consent, forms, pages: pages.length };
  }, [result]);

  if (!site) return null;

  if (!observed || observed.pages === 0) {
    return (
      <>
        <PageHeader title="Can we spend yet" description="The gate this desk will not go round." />
        <Notice kind="warn" title="Nothing crawled yet">
          This reads the pages this workspace has already fetched, so run the audit first and come
          back. <Link href={`/app/sites/${site.id}`}>Run it from the brief</Link>.
        </Notice>
      </>
    );
  }

  // Observed, not asked. A tag found in the page source is evidence that a tag
  // exists; it is not evidence that a conversion arrives, which is why the
  // round trip stays false until somebody actually fires one.
  const signals: TrackingSignals = {
    ...NO_TRACKING,
    tagPresent: observed.googleAds || observed.metaPixel || observed.analytics.length > 0,
    roundTripVerified: false,
    consentMode: observed.consent,
    objective: "lead_gen",
  };
  const readiness = measurementReadiness(signals);

  return (
    <>
      <PageHeader
        title="Can we spend yet"
        description={`Read from the ${observed.pages} pages this workspace crawled, not from a questionnaire.`}
      />

      {readiness.blocking.length > 0 ? (
        <Notice kind="bad" title="Blocked. No budget is planned until this clears.">
          {readiness.blocking[0]}
        </Notice>
      ) : (
        <Notice kind="ok" title="Cleared to plan">
          A conversion on this site can be counted.
        </Notice>
      )}

      <Card title="What the crawl found">
        <ul className="prose-list small">
          <li>
            <strong>Analytics:</strong>{" "}
            {observed.analytics.length ? observed.analytics.join(", ") : "none detected on any crawled page"}
          </li>
          <li>
            <strong>Google Ads conversion tag:</strong> {observed.googleAds ? "present" : "not found"}
          </li>
          <li>
            <strong>Meta pixel:</strong> {observed.metaPixel ? "present" : "not found"}
          </li>
          <li>
            <strong>A consent platform:</strong>{" "}
            {observed.consent
              ? "present, which is what Consent Mode needs to work against"
              : "not found, and Google will not use data from EEA or UK visitors who declined"}
          </li>
          <li>
            <strong>Forms:</strong> {observed.forms} across {observed.pages} pages
          </li>
        </ul>
      </Card>

      <Notice kind="warn" title="A tag in the source is not a conversion that arrived">
        Everything above is what can be seen from outside your site. It proves a tag exists. It does
        not prove a conversion reaches the platform, and a tag that fires into nothing is worse than
        no tag because it looks like measurement. The round trip, sending a test conversion and
        reading it back from the platform&rsquo;s own reporting, needs a connected ad account, so
        this check stays incomplete until one exists.
      </Notice>

      {readiness.degraded.length > 0 && (
        <Card title="What would make the measurement good rather than merely present">
          <ul className="prose-list small">
            {readiness.degraded.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </Card>
      )}

      {readiness.strengths.length > 0 && (
        <Card title="Already in place">
          <ul className="prose-list small">
            {readiness.strengths.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </Card>
      )}

      <Card title="Why this is a gate and not a score">
        <p className="small" style={{ marginTop: 0 }}>
          A platform optimising toward a conversion it cannot see does worse than one given no
          target at all, because it optimises confidently toward the wrong thing. So an account
          without working measurement does not get a reduced version of this service. It gets a
          blocked one, and no autonomy setting on any plan overrides that.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          The single biggest improvement available to a lead generation account is capturing the
          click id on form submit and sending the real value back when that lead becomes a customer.
          It turns forty enquiries into three customers worth eighteen thousand, and changes what
          the platform optimises for. Almost no self-serve tool does it.
        </p>
      </Card>
    </>
  );
}
