import { ToolLanding } from "@/components/lab/tool-landing";
import { LAB, labPath } from "@/lib/brand";

export const metadata = {
  title: `${LAB} Content: test how your writing sounds`,
  description:
    "Measure your page's rhythm, filler, hedging, specifics and reading level against up to five competitors. Counted, not judged. Free, no signup, no AI.",
  alternates: { canonical: "/thymelab/content" },
};

export default function LabContent() {
  return (
    <ToolLanding
      tool="content"
      eyebrow={`${LAB} Content`}
      title="Sound like you, not"
      glow="everyone else."
      lede="Put your page next to the ones you compete with. We count what makes writing sound generic, so you can see where yours blends in and where it stands out."
      primary={{ href: labPath("/content/voice"), label: "Test my writing" }}
      does={[
        { title: "Counts, not opinions", body: "Sentence rhythm, filler words, hedging, specifics and reading level, measured the same way every time." },
        { title: "Against your rivals", body: "Your page next to up to five competitors, so you know what normal looks like in your market." },
        { title: "Shows what to change", body: "Where you sound like everyone else, and where you already sound like yourself." },
      ]}
      readout={[
        { label: "reading level ..............", value: "easier than 4 of 5 rivals" },
        { label: "filler words ...............", value: "high, 3 phrases to cut", tone: "hi" },
        { label: "specific numbers & names ...", value: "fewer than your rivals" },
        { label: "says 'we' vs 'you' .........", value: "mostly 'we'", tone: "hi" },
      ]}
      faq={[
        { q: "Does it use AI to judge my writing?", a: "No. It counts things, like sentence length and filler words, so the same page always gets the same answer." },
        { q: "What if there aren't enough competitors?", a: "It needs at least three readable rival pages to draw a comparison, and says so rather than comparing you with one competitor." },
      ]}
    />
  );
}
