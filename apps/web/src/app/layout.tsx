import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fullseoaeogeotool.jishhnnuu.workers.dev"),
  title: {
    default: "Thymesnow: a digital marketing agency run by AI agents",
    template: "%s | Thymesnow",
  },
  description:
    "Connect a site and the work a digital marketing agency would do happens without you: search, content, structured data, internal linking, local listings, link prospecting, AI answer visibility and the reporting that explains what changed. You approve the work rather than doing it.",
  openGraph: {
    type: "website",
    siteName: "Thymesnow",
    title: "Thymesnow: a digital marketing agency run by AI agents",
    description:
      "Audit, fix, write, publish and report. One organisation of agents covering search, content, AI answers and, soon, paid and social, with you approving the work rather than doing it.",
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
