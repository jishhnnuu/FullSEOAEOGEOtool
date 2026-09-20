/**
 * The name, the domain, and everything that has to change when they change.
 *
 * The product ships before it is named. That is a deliberate sequence, not an
 * oversight: the engine is the hard part and a name is a text substitution, so
 * nothing downstream is allowed to hard-code either. Every page title, canonical
 * URL, sitemap entry, JSON-LD node, llms.txt header, OAuth redirect and email
 * footer reads from here.
 *
 * To launch on a real domain, set two environment variables on the deployment
 * and redeploy. Nothing else in the codebase needs editing, and `npm run
 * brand:check` fails the build if a hard-coded workers.dev URL creeps back in.
 *
 *   NEXT_PUBLIC_BRAND_NAME   the product name, e.g. "Northstar"
 *   NEXT_PUBLIC_SITE_URL     the origin, e.g. "https://northstar.com"
 *
 * The fallbacks below are the pre-launch values. They are deliberately
 * unglamorous so that nobody mistakes them for a decision.
 */

const FALLBACK_NAME = "SEO OS";
const FALLBACK_URL = "https://fullseoaeogeotool.jishhnnuu.workers.dev";

function env(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

/** The origin, with no trailing slash, so joins never double up. */
export const SITE_URL = env("NEXT_PUBLIC_SITE_URL", FALLBACK_URL).replace(/\/+$/, "");

/** The product name, as it appears in prose and in the page title. */
export const BRAND = env("NEXT_PUBLIC_BRAND_NAME", FALLBACK_NAME);

/** The bare host, for display and for the entity name in JSON-LD. */
export const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return SITE_URL.replace(/^https?:\/\//, "");
  }
})();

/**
 * Whether this deployment is running on its real domain yet.
 *
 * Used to decide whether to ask search engines to index. A workers.dev
 * subdomain that later moves to a real domain leaves a duplicate of the whole
 * site behind in the index, competing with itself, so the pre-launch
 * deployment is explicitly noindex and the launch flips it in one variable.
 */
export const IS_LAUNCHED = SITE_URL !== FALLBACK_URL;

export const TAGLINE = "The search agency, as software";

export const DESCRIPTION =
  "Audit any site against 90 checks, then take the fixes already written: titles, " +
  "meta, JSON-LD, sitemap, robots.txt, llms.txt, internal link plans and content " +
  "briefs. Covers SEO, AEO and GEO. No account, no card, no API key.";

/** One sentence, used where a description has to be short. */
export const SHORT_DESCRIPTION =
  "Crawl a site, find what is wrong, and take the fix already written. SEO, AEO and GEO in one platform.";

/** Absolute URL for a path. Every canonical and sitemap entry goes through this. */
export function url(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The social preview image.
 *
 * Generated at the edge by `app/opengraph-image.tsx` rather than shipped as a
 * file, because the name is not fixed yet and a PNG with the wrong name baked
 * into it is worse than no image at all.
 */
export const OG_IMAGE = url("/opengraph-image");

/**
 * Where the product's own entity is defined, once, for every other JSON-LD
 * node to reference by `@id`.
 *
 * A node carrying an `@id` is a reference into the graph rather than an
 * incomplete copy of it, which is the rule `schema_contradicts_page` and the
 * schema validator both hold to. Defining the organisation once and pointing
 * at it everywhere is what that rule looks like applied to our own site.
 */
export const ORG_ID = url("/#organization");
export const SITE_ID = url("/#website");

export const SOCIAL: { label: string; href: string }[] = [
  // Deliberately empty until the accounts exist under the real name. An empty
  // sameAs array is honest; one pointing at a placeholder profile is not, and
  // sameAs is exactly where an answer engine looks to resolve an entity.
];
