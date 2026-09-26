/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No rewrites here on purpose. Next resolves rewrites at build time and
  // bakes the destination into the route manifest, so a rewrite cannot be
  // repointed per environment. src/app/api/[...path]/route.ts proxies at
  // request time instead, which lets one built image run everywhere.
  //
  // Redirects are the exception because they never change per environment.
  // The tools moved to /thymelab when the lab became its own side of the
  // site; a permanent redirect keeps every old link and bookmark working and
  // tells search engines where the page went.
  async redirects() {
    return [
      { source: "/tools", destination: "/thymelab", permanent: true },
      { source: "/tools/social-teardown", destination: "/thymelab/social/teardown", permanent: true },
      { source: "/tools/voice-check", destination: "/thymelab/content/voice", permanent: true },
      { source: "/tools/ad-budget-check", destination: "/thymelab/ads/budget", permanent: true },
      { source: "/tools/:slug", destination: "/thymelab/seo/checks/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
