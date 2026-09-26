import Link from "next/link";

import { BRAND, LAB, LAB_PATH } from "@/lib/brand";

/**
 * The strip above every header that says there are two things here.
 *
 * Banks put Personal and Business at the very top for the same reason: two
 * audiences, one company, and the visitor should know which side they are on
 * before they read a word. The current side is highlighted; the other is one
 * click away and never more prominent than that.
 */
export function SideSwitch({ current }: { current: "agency" | "lab" }) {
  return (
    <div className={`side-switch ${current === "lab" ? "on-lab" : "on-agency"}`}>
      <div className="side-switch-inner">
        <Link href="/" className={current === "agency" ? "side on" : "side"} aria-current={current === "agency" ? "page" : undefined}>
          <b>{BRAND}</b>
          <span>We do your marketing for you</span>
        </Link>
        <Link href={LAB_PATH} className={current === "lab" ? "side on" : "side"} aria-current={current === "lab" ? "page" : undefined}>
          <b>{LAB}</b>
          <span>Do it yourself, with our tools</span>
        </Link>
      </div>
    </div>
  );
}
