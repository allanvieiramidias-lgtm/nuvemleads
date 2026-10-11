import { defineConfig } from "tsup";

// Servidor customizado (Next + Socket.IO), migrações e seed compilados para dist/
export default defineConfig({
  entry: { server: "server.ts", migrate: "scripts/migrate.ts", seed: "scripts/seed.ts" },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
});
