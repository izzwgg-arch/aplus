import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/smart-steps",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
