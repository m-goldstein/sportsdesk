import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": ["./signalbot/**/*", "./tests/**/*"] },
};
export default config;
