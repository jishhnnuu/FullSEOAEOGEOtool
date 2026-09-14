"use client";

import useSWR from "swr";
import { fetcher, type AgentRoster } from "@/lib/api";
import { Card, ErrorNote, Loading, PageHeader } from "@/components/ui";

const DEPARTMENT_ORDER = [
  "leadership", "strategy", "research", "technical", "content",
  "aeo", "offpage", "local", "commerce", "conversion", "operations",
];

const DEPARTMENT_BLURB: Record<string, string> = {
  leadership: "Decides what reaches you, and unblocks everything else.",
  strategy: "Decides what gets worked on and in what order.",
  research: "Establishes what people search and who you are competing with.",
  technical: "Keeps the site crawlable, fast and indexed.",
  content: "Briefs, writes, fact-checks and edits everything you publish.",
  aeo: "Gets you named and cited inside AI answers.",
  offpage: "Earns links and coverage. Never buys them.",
  local: "Runs your Business Profile, reviews and map pack visibility.",
  commerce: "Product, category and feed work for stores.",
  conversion: "Makes sure the traffic is worth having.",
  operations: "Publishes, tests, and keeps everything legal and safe.",
};

export default function TeamPage() {
  const { data, error } = useSWR<AgentRoster>("/agents", fetcher);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading label="Loading your team" />;

  const departments = Object.keys(data.by_department)
    .sort((a, b) => DEPARTMENT_ORDER.indexOf(a) - DEPARTMENT_ORDER.indexOf(b));

  return (
    <>
      <PageHeader
        title="Your team"
        description={`${data.total} specialists work on your account. Each one has a defined job, a fixed set of tools, and limits it cannot exceed.`}
      />
      <div className="stack">
        {departments.map((dept) => (
          <Card key={dept} title={dept.charAt(0).toUpperCase() + dept.slice(1)}>
            <p className="muted small" style={{ marginTop: "-0.4rem" }}>
              {DEPARTMENT_BLURB[dept]}
            </p>
            <table>
              <tbody>
                {data.by_department[dept].map((agent) => (
                  <tr key={agent.key}>
                    <td style={{ width: "26%" }}>
                      <strong>{agent.name}</strong>
                      <div className="faint small">{agent.role}</div>
                    </td>
                    <td className="small muted">{agent.summary}</td>
                    <td className="faint small num" style={{ whiteSpace: "nowrap" }}>
                      {agent.tools} tool{agent.tools === 1 ? "" : "s"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  );
}
