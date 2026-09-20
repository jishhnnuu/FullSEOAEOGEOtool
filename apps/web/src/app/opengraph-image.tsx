import { ImageResponse } from "next/og";

import { BRAND, SITE_HOST, TAGLINE } from "@/lib/brand";

/**
 * The social preview card.
 *
 * Generated at the edge rather than shipped as a PNG, because the product is
 * not named yet and a file with the wrong name baked into it is worse than no
 * image. When `NEXT_PUBLIC_BRAND_NAME` changes, this changes with it and
 * nothing has to be redrawn.
 *
 * `no_social_preview` is a low-severity check in the catalogue and it fired
 * against this site. Low severity is still a finding.
 */

export const alt = `${BRAND}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0e14",
          color: "#f4f6fb",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: "#5b8cff" }} />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{BRAND}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 940 }}>
            {TAGLINE}
          </div>
          <div style={{ fontSize: 30, color: "#9aa4bd", maxWidth: 900, lineHeight: 1.35 }}>
            Audit any site against 90 checks, then take the fixes already written.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#6f7a96" }}>
          <div>SEO, AEO and GEO</div>
          <div>{SITE_HOST}</div>
        </div>
      </div>
    ),
    size,
  );
}
