import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lambda deploy target (run.sh + Lambda Web Adapter) — same stack as Propia-web
  output: "standalone",
  experimental: {
    serverActions: {
      // The adapter reports a local host, so the Origin check needs the real domain.
      allowedOrigins: ["admin.propia.dev"],
    },
  },
};

export default nextConfig;
