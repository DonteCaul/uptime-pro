import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the production Docker image.
  output: "standalone",

  // Allow large multipart uploads (up to 50 CSV files at ~1MB each).
  // The proxy buffers the request body and defaults to 10MB, which breaks
  // multi-file CSV uploads (~40MB total). Bump to 100MB for headroom.
  experimental: {
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
