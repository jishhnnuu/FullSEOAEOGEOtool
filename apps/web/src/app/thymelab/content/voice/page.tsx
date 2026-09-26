import { LAB } from "@/lib/brand";
import Link from "next/link";

import { ToolBench } from "@/components/lab/tool-bench";
import { VoiceTool } from "@/components/voice-tool";

export const metadata = {
  title: `${LAB} Content: test your writing against your rivals`,
  description:
    "Measure your page's rhythm, filler, hedging, specifics and reading level against up to five competitors. Counted, not judged. No AI, no signup.",
  alternates: { canonical: "/thymelab/content/voice" },
};

export default function VoiceBench() {
  return (
    <ToolBench
      tool="content"
      path="content"
      layout="desk"
      title={`${LAB} Content`}
      lead="Your page against up to five rivals. Counted, not judged, so the same page always gets the same answer."
      aside={
        <>
          <div className="lab-card">
            <span className="lab-mono wb-k">How to run it</span>
            <ol>
              <li>Paste the page you want to test.</li>
              <li>Add the pages you compete with. Three or more.</li>
              <li>Read where you blend in, and where you already sound like you.</li>
            </ol>
          </div>
          <div className="lab-card">
            <span className="lab-mono wb-k">What it counts</span>
            <p className="lab-muted small" style={{ margin: 0 }}>
              Sentence rhythm, hedging, filler, numbers and names per hundred words, reading level, and how often the page
              says &ldquo;we&rdquo; against &ldquo;you&rdquo;.
            </p>
          </div>
        </>
      }
      after={
        <div>
          <details className="acc">
            <summary>Counting, not judging</summary>
            <div className="acc-body">
              <p>
                No model reads these pages. Every figure is a count you could reproduce by hand: how many sentences, how
                long each one, how many hedge, how many numbers and names appear per hundred words.
              </p>
              <p>
                It refuses in two situations, on purpose. A page under 120 words has no rhythm to measure, so it is
                dropped and named. Fewer than three readable rivals is not a field, so no comparison is drawn.
              </p>
            </div>
          </details>
          <details className="acc">
            <summary>Rather have it written for you?</summary>
            <div className="acc-body">
              <p>Our agency&rsquo;s content team writes in your measured voice, and a specialist checks every piece. <Link href="/content">See the content service</Link>.</p>
            </div>
          </details>
        </div>
      }
    >
      <VoiceTool />
    </ToolBench>
  );
}
