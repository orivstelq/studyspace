import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: securityHeaders({
        development: process.env.NODE_ENV === "development",
        appBaseUrl: process.env.APP_BASE_URL,
      }),
    }];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
