import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://nuvem:nuvem-dev@localhost:5432/nuvemleads_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          env: { DATABASE_URL: TEST_DATABASE_URL, UPLOAD_DIR: "./.data/test-uploads" },
          // um arquivo por vez: todos usam o mesmo banco
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
