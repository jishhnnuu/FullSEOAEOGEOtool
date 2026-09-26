"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The most important control on the site.
 *
 * It used to sit in section eight of nine, on the theory that nobody hands a
 * domain to a company they cannot yet describe. In practice people could not
 * find the thing the product does, which is worse. It now leads the page.
 *
 * Paste and go: `go=1` starts the audit on arrival, so there is no second
 * form between typing a URL and watching the crawl run.
 */
export function UrlStart({
  label = "Show me what's broken",
  note = true,
}: {
  label?: string;
  note?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [nudge, setNudge] = useState(false);

  return (
    <div>
      <form
        className="urlbox"
        onSubmit={(event) => {
          event.preventDefault();
          const url = value.trim();
          if (!url) {
            setNudge(true);
            return;
          }
          router.push(`/app/new?url=${encodeURIComponent(url)}&go=1`);
        }}
      >
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          aria-label="Website address"
          placeholder="anywebsite.com"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setNudge(false);
          }}
        />
        <button type="submit">{label} &rarr;</button>
      </form>
      {nudge && (
        <p className="small" style={{ marginTop: "0.6rem", color: "var(--bad)" }}>
          Pop a website address in first. Something like anywebsite.com.
        </p>
      )}
      {note && (
        <div className="urlbox-note">
          <span>Free</span>
          <span>No signup</span>
          <span>About 4 minutes</span>
        </div>
      )}
    </div>
  );
}
