"use client";

import { Teardown } from "@/components/social-desk";
import { useSite } from "@/lib/site-hooks";
import { PageHeader } from "@/components/ui";

export default function TeardownPage() {
  const { site } = useSite();
  if (!site) return null;
  return (
    <>
      <PageHeader
        title="Competitor teardown"
        description="What measurably worked for one account, against its own median rather than against its follower count. No impressions appear anywhere on this page, because no platform publishes them for an account you do not own."
      />
      <Teardown />
    </>
  );
}
