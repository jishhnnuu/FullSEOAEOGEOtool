/**
 * The site's own structured data.
 *
 * This product raises `no_organization_schema`, `entity_unclear` and
 * `schema_missing` against other people's sites. It raised all three against
 * this one, on every page, until this file existed. A tool that sells AEO and
 * cannot pass its own AEO checks has no argument to make, so the entity graph
 * here is built to the same rules the validator enforces:
 *
 *  - The organisation is defined **once**, at `ORG_ID`, and every other node
 *    references it by `@id` rather than restating it. A second copy of an
 *    entity is how an entity graph gets broken by the tool meant to fix it.
 *  - Nothing is asserted that is not true. `sameAs` stays empty until the
 *    accounts exist, because `sameAs` is precisely where an answer engine
 *    looks to resolve an entity and a wrong link there is worse than none.
 *  - No `aggregateRating`. Inventing review counts is the single most common
 *    piece of schema fraud in this category and it is a manual action risk.
 */

import { BRAND, DESCRIPTION, ORG_ID, OG_IMAGE, SHORT_DESCRIPTION, SITE_ID, SITE_URL, SOCIAL, url } from "./brand";

type Node = Record<string, unknown>;

/** The organisation, defined once. Everything else points at this. */
export function organizationNode(): Node {
  const node: Node = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: BRAND,
    url: SITE_URL,
    description: SHORT_DESCRIPTION,
  };
  if (SOCIAL.length > 0) node.sameAs = SOCIAL.map((s) => s.href);
  return node;
}

export function websiteNode(): Node {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL,
    name: BRAND,
    description: SHORT_DESCRIPTION,
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The product itself.
 *
 * `offers` states the free tier, which is true and checkable: the audit runs
 * with no account and no card. A price of 0 that is not real is the schema
 * equivalent of a fake review.
 */
export function softwareNode(): Node {
  return {
    "@type": "SoftwareApplication",
    "@id": url("/#software"),
    name: BRAND,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Search engine optimisation",
    operatingSystem: "Web browser",
    description: DESCRIPTION,
    url: SITE_URL,
    publisher: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "GBP",
      description: "Full audit, every check, every generated fix. No account required.",
    },
    featureList: [
      "Technical SEO crawl and audit",
      "Answer engine optimisation (AEO) and generative engine optimisation (GEO)",
      "AI crawler access and extractability checks",
      "Generated fixes: titles, meta, JSON-LD, sitemap, robots.txt, llms.txt",
      "Internal link planning",
      "Content briefs and drafts",
      "Link prospecting with risk assessment",
      "Local SEO and Business Profile",
    ],
  };
}

export function breadcrumbNode(trail: { name: string; path: string }[]): Node {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: url(item.path),
    })),
  };
}

export function faqNode(items: { q: string; a: string }[]): Node {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function articleNode(opts: {
  headline: string;
  description: string;
  path: string;
  published: string;
  modified?: string;
}): Node {
  return {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url: url(opts.path),
    mainEntityOfPage: url(opts.path),
    datePublished: opts.published,
    dateModified: opts.modified ?? opts.published,
    image: OG_IMAGE,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

export function definedTermNode(opts: { term: string; definition: string; path: string }): Node {
  return {
    "@type": "DefinedTerm",
    name: opts.term,
    description: opts.definition,
    url: url(opts.path),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      "@id": url("/glossary#set"),
      name: `${BRAND} search glossary`,
      url: url("/glossary"),
    },
  };
}

/**
 * Wrap a set of nodes into one `@graph`, which is the shape that lets `@id`
 * references resolve inside a single script tag rather than across several.
 */
export function graph(...nodes: Node[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }, null, 0);
}
