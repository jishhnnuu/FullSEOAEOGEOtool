/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No rewrites here on purpose. Next resolves rewrites at build time and
  // bakes the destination into the route manifest, so a rewrite cannot be
  // repointed per environment. src/app/api/[...path]/route.ts proxies at
  // request time instead, which lets one built image run everywhere.
};
export default nextConfig;
