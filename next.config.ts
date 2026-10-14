import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile):
  // emits .next/standalone with a minimal server.js and only the traced
  // runtime dependencies.
  output: "standalone",
  // NOTE: Partial Prerendering (cacheComponents/partialPrefetching) is left OFF.
  // With it enabled, the home page's client component (TvShell), which is nested
  // in an async server component behind `await connection()`, failed to hydrate in
  // the browser (no /api/songs fetch, no interactivity) while /remote worked. The
  // app is fully dynamic on the LAN, so PPR buys nothing here.
};

export default nextConfig;
