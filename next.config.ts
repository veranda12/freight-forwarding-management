import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // We run lint separately; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["@react-pdf/renderer", "bcryptjs"],
};

export default nextConfig;
