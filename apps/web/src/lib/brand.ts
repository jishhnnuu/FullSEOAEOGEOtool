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
 * The fallback name is a working name, not a decision. It is here rather than
 * spread through the codebase precisely so that changing it stays a one-line
 * edit and an environment variable.
 */

const FALLBACK_NAME = "Thymesnow";
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

export const TAGLINE = "A digital marketing agency run by AI agents";

export const DESCRIPTION =
  "An AI marketing team across search, content, social and paid, with one CMO you talk to. " +
  "Crawl a site, take the fixes already written, get a point of view argued and a " +
  "draft written against it, and plan ads that only spend what can be measured. " +
  "Nothing goes live without your yes. No account, no card, no API key.";

/** One sentence, used where a description has to be short. */
export const SHORT_DESCRIPTION =
  "The work a digital marketing agency does, done by agents. You approve it rather than doing it.";

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
