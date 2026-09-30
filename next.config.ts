import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Runtime data and secrets must come from persistent storage or the environment.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*"],
  },
};

export default nextConfig;
