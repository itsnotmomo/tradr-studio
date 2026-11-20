import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // The Inspo playbook is read from the repo at request time.
  outputFileTracingIncludes: { "/inspo": ["./docs/media-playbook.md"] },
  // sharp is only for the local scripts (import-posts, inspo-fill-missing, news/qrcheck).
  // Images are unoptimized, so no server code needs it: keep it out of every function.
  outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**"] },
  // Screens removed in Tradr Media. Old links (bookmarks, past ntfy messages) land on the Planner.
  async redirects() {
    return ["/batch", "/captions", "/ideas", "/posted", "/tools", "/tools/:path*"].map((source) => ({ source, destination: "/", permanent: false }));
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
