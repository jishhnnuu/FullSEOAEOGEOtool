/** Line icons for the lab's tools. Stroke colour comes from the card's tone. */
export function ToolIcon({ tool }: { tool: "seo" | "content" | "social" | "ads" | "website" }) {
  if (tool === "seo") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /><path d="M8 10.5h5M10.5 8v5" /></svg>
    );
  }
  if (tool === "content") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z" /><path d="M8 11h8M8 14.5h8M8 18h5" /></svg>
    );
  }
  if (tool === "social") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2.5" /><path d="M9.5 9.2c0-1 1-1.7 2.5-.6 1.5-1.1 2.5-.4 2.5.6 0 1.6-2.5 3-2.5 3s-2.5-1.4-2.5-3z" /><path d="M9 16.5h6" /></svg>
    );
  }
  if (tool === "ads") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /><circle cx="19" cy="6" r="2.5" /></svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 8.5h18" /><path d="M7 12.5h5v4H7zM14.5 12.5H17M14.5 16H17" /></svg>
  );
}
