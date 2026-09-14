import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fullseoaeogeotool.jishhnnuu.workers.dev"),
  title: {
    default: "SEO OS: the search agency, as software",
    template: "%s | SEO OS",
  },
  description:
    "Connect a site and the work an SEO agency would do happens without them: technical fixes, content, structured data, internal linking, local listings, link prospecting and the reporting that explains what changed. Built for search, AI answers and generative engines.",
  openGraph: {
    type: "website",
    siteName: "SEO OS",
    title: "SEO OS: the search agency, as software",
    description:
      "Audit, fix, write, publish and report. One platform covering SEO, AEO and GEO, with you approving the work rather than doing it.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
