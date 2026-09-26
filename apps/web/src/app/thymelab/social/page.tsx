import { ToolLanding } from "@/components/lab/tool-landing";
import { LAB, labPath } from "@/lib/brand";

export const metadata = {
  title: `${LAB} Social: see what's working for your competitors`,
  description:
    "Study any public YouTube channel: which posts beat that account's own usual, and what the winners have in common. No fake reach numbers. Free, no signup.",
  alternates: { canonical: "/thymelab/social" },
};

export default function LabSocial() {
  return (
    <ToolLanding
      tool="social"
      eyebrow={`${LAB} Social`}
      title="See what's working for"
      glow="your rivals."
      lede="Type a competitor's handle. We find the posts that beat their own usual, and what those winners have in common, so you know what to try next."
      primary={{ href: labPath("/social/teardown"), label: "Scout a competitor" }}
      does={[
        { title: "Reads their recent posts", body: "The latest public uploads of any YouTube channel, with no key needed." },
        { title: "Finds the real winners", body: "Each post compared with that account's own median, so follower count doesn't skew it." },
        { title: "Names the pattern", body: "The hooks, formats and topics the winners share, in plain English." },
      ]}
      readout={[
        { label: "posts read .................", value: "15 latest uploads" },
        { label: "best post ..................", value: "4.2x their usual", tone: "hi" },
        { label: "winning format .............", value: "short how-to" },
        { label: "their reach ................", value: "not public, never guessed", tone: "dim" },
      ]}
      faq={[
        { q: "Why no reach or impressions?", a: "Because no platform makes those public for someone else's account. Any tool showing a rival's reach has estimated it. We show what can actually be measured." },
        { q: "Which platforms work?", a: "YouTube works with no key at all. Other networks either need your own access or don't allow studying someone else's account." },
      ]}
    />
  );
}
