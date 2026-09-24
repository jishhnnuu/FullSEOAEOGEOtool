"use client";

import { CompareBrands } from "@/components/social-desk";
import { useSite } from "@/lib/site-hooks";
import { PageHeader } from "@/components/ui";

export default function ComparePage() {
  const { site } = useSite();
  if (!site) return null;
  return (
    <>
      <PageHeader
        title="Compare brands"
        description="Up to five accounts on one platform. Two numbers per brand, because one misleads: how loud they are, and how much anyone cared."
      />
      <CompareBrands />
    </>
  );
}
