import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // O selo do modo de desenvolvimento cobre o botão de anexo no celular.
  devIndicators: false,
  // sharp, argon2 e ffmpeg rodam só no servidor Node
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg"],
};

export default nextConfig;
