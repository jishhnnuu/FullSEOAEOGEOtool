import { LAB } from "@/lib/brand";
import Link from "next/link";

import { ToolBench } from "@/components/lab/tool-bench";
import { SocialTeardownTool } from "@/components/social-teardown-tool";
import { PLATFORMS, readableForCompetitors } from "@/lib/social-platforms";

export const metadata = {
  title: `${LAB} Social: study a competitor's posts`,
  description:
    "Read a competitor's public posts, find the ones that beat their own median, and name the hook the winners share. YouTube needs no key at all. No signup.",
  alternates: { canonical: "/thymelab/social/teardown" },
};

export default function TeardownBench() {
  const readable = readableForCompetitors();
  return (
    <ToolBench
      tool="social"
      path="social"
      layout="signal"
      title={`${LAB} Social`}
      lead="Type a competitor's handle. See which of their posts beat their own usual, and what the winners have in common."
      aside={
        <>
          <div className="lab-card">
            <span className="lab-mono wb-k">What we measure</span>
            <ul>
              <li>Likes, comments and views each post earned</li>
              <li>Each post against that account&rsquo;s own median</li>
              <li>The hooks and formats the winners share</li>
            </ul>
          </div>
          <div className="lab-card">
            <span className="lab-mono wb-k">What we never show</span>
            <ul>
              <li>A rival&rsquo;s reach or impressions. They aren&rsquo;t public, so any number would be a guess.</li>
            </ul>
          </div>
        </>
      }
      after={
        <div>
          <details className="acc">
            <summary>Why there is no impressions column</summary>
            <div className="acc-body">
              <p>
                Impressions, reach, saves and profile visits are computed by the platform for the account owner and
                released only through that owner&rsquo;s own access. No public endpoint returns them for somebody
                else&rsquo;s account, so every competitor reach figure a tool has shown you was estimated.
              </p>
              <p>
                What is public is engagement. The honest comparison built from it is the performance multiple: a
                post&rsquo;s engagement divided by the median of that same account. Of the {PLATFORMS.length} networks we
                know about, {readable.length} allow a competitor study at all.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>What happens to a key you paste</summary>
            <div className="acc-body">
              <p>
                It stays in your browser and in the one request that uses it. Nothing is written to a database. YouTube
                needs no key at all.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>Rather have your socials run for you?</summary>
            <div className="acc-body">
              <p>Our agency plans your calendar and drafts every post, checked by a specialist. <Link href="/social">See the social service</Link>.</p>
            </div>
          </details>
        </div>
      }
    >
      <SocialTeardownTool />
    </ToolBench>
  );
}
