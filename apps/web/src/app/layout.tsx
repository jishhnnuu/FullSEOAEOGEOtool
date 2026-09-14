import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO OS",
  description: "Autonomous search growth. You approve the content; it handles the rest.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
