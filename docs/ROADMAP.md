# Roadmap: open decisions

Things the owner has asked to be reminded about. Each stays here until the
owner closes it, and CLAUDE.md lists them so every conversation raises them.

## Thymelab website builder

**Asked for:** September 2026.
**Where it stands:** `/thymelab/website` is a waiting list. The agency builds
websites by hand today (`/websites`), so nobody is turned away.

**The work, when the owner says go:**

1. Survey the builders people already pay for (Framer, Webflow, Wix, Squarespace,
   Durable and the AI-first builders) for what they get right in the first ten
   minutes, and where their SEO defaults fail the checks this product runs.
2. Survey open-source builders and site generators that come with hosting or
   deploy cleanly to Cloudflare Pages or Workers, for licence, maintenance and
   whether their output is server-rendered HTML (no major AI crawler runs
   JavaScript, so a client-rendered builder fails the product's own premise).
3. Recommend one of build, fork or partner, with the cost of each in weeks and
   in hosting per site, and what would have to be true for the builder to pass
   the audit on day one.

**Constraints already decided:** the client owns the site and can leave with
it; pages render as HTML without JavaScript; the audit runs on every publish;
nothing goes live without the owner's yes.
