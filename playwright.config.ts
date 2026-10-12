import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/env";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${E2E.port}`,
    trace: "retain-on-failure",
    // Opcional: aponta para um Chromium já instalado (ex.: ambientes sem download de navegador)
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${E2E.port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(E2E.port),
      APP_URL: `http://localhost:${E2E.port}`,
      DATABASE_URL: E2E.databaseUrl,
      MAIL_OUTBOX: E2E.outbox,
      SMTP_PASS: "",
    },
  },
});
