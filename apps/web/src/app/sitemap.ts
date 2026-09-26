import type { MetadataRoute } from "next";

import { allComparisons } from "@/content/compare";
import { allGlossary } from "@/content/glossary";
import { allTools } from "@/content/tools";
import { IS_LAUNCHED, url } from "@/lib/brand";
import { ROUTES } from "@/lib/routes";

/**
 * The sitemap.
 *
 * Built from the route table and the content modules rather than written by
 * hand, so a page cannot exist without being listed. `sitemap_missing_pages`
 * is a check this product raises against other people's sites; generating the
 * file from the same source the pages come from is what makes it impossible
 * to fail here.
 *
 * Empty until the real domain is set, because a sitemap on a pre-launch
 * subdomain invites the index to fill with URLs that are about to move.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_LAUNCHED) return [];

  const now = new Date();

  const core = ROUTES.map((route) => ({
    url: url(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const compare = [
    { url: url("/compare"), lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 },
    ...allComparisons().map((c) => ({
      url: url(`/compare/${c.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  const tools = [
    { url: url("/thymelab"), lastModified: now, changeFrequency: "monthly" as const, priority: 0.9 },
    ...allTools().map((t) => ({
      url: url(`/thymelab/seo/checks/${t.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  const glossary = [
    { url: url("/glossary"), lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
    ...allGlossary().map((g) => ({
      url: url(`/glossary/${g.slug}`),
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];

  const essays = [
    {
      url: url("/ai-crawlers-and-javascript"),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
  ];

  return [...core, ...compare, ...tools, ...glossary, ...essays];
}
