"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The one control on the marketing site that does something.
 *
 * It does not collect an email first. A prospect who cannot see a real finding
 * before handing over an address has been given a brochure, not a tool.
 */
export function UrlStart({ label = "Audit my site", size = "big" }: { label?: string; size?: "big" | "small" }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const url = value.trim();
        router.push(url ? `/app/new?url=${encodeURIComponent(url)}` : "/app/new");
      }}
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", maxWidth: "520px" }}
    >
      <input
        type="text"
        inputMode="url"
        aria-label="Your website address"
        placeholder="yourcompany.com"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        style={{ flex: "1 1 240px", ...(size === "big" ? { padding: "0.65rem 0.8rem", fontSize: "0.95rem" } : {}) }}
      />
      <button type="submit" className={`primary ${size === "big" ? "big-button" : ""}`}>
        {label}
      </button>
    </form>
  );
}
