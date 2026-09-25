import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";

import { BRAND, DESCRIPTION, IS_LAUNCHED, OG_IMAGE, SITE_URL, TAGLINE } from "@/lib/brand";
import { graph, organizationNode, softwareNode, websiteNode } from "@/lib/schema";

import "./globals.css";

/*
 * The display face, self-hosted.
 *
 * next/font downloads it at build time and serves it from our own domain, so
 * no visitor's browser asks Google for anything to render a heading. The
 * privacy page promises no third-party requests of that kind, and a font CDN
 * would quietly break the promise on every page view.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

/**
 * Nothing here names the product directly.
 *
 * Everything reads from `lib/brand.ts`, so launching on a real domain is two
 * environment variables and a redeploy rather than a search and replace across
 * the codebase. `IS_LAUNCHED` also decides indexing: a pre-launch subdomain
 * that later moves leaves a full duplicate of the site in the index competing
 * with the real one, so until the domain is set this is noindex everywhere.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND}: ${TAGLINE}`,
    template: `%s | ${BRAND}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND,
  /*
   * No canonical here on purpose.
   *
   * `alternates.canonical` in the root layout cascades to every page that
   * does not override it, which pointed eleven pages at the homepage the
   * first time this file was written. That is `canonical_mismatch`, a high
   * severity finding in our own catalogue, and it is worse than a missing
   * canonical because it actively tells the engine to drop the page. Each
   * route declares its own, and `npm run seo:check` fails the build if one
   * forgets.
   */
  openGraph: {
    type: "website",
    siteName: BRAND,
    url: SITE_URL,
    title: `${BRAND}: ${TAGLINE}`,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${BRAND}: ${TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND}: ${TAGLINE}`,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: IS_LAUNCHED
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" } }
    : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <head>
        {/*
          One graph, not three script tags. Defining the organisation once and
          referencing it by @id everywhere else is the rule the schema
          validator enforces against other people's sites, and a second copy of
          an entity is how an entity graph gets broken by the tool meant to be
          fixing it.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: graph(organizationNode(), websiteNode(), softwareNode()) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
