import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // sharp, argon2 e ffmpeg rodam só no servidor Node
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg"],
};

export default nextConfig;
