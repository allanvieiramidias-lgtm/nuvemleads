import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/env";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  globalSetup: "./tests/e2e/global-setup.ts",
  // O servidor de desenvolvimento compila cada página na primeira visita: folga para isso.
  expect: { timeout: 15_000 },
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${E2E.port}`,
    trace: "retain-on-failure",
    // Opcional: aponta para um Chromium já instalado (ex.: ambientes sem download de navegador)
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  // Ordem: 1) fluxo completo do admin (cria/altera pessoas) → 2) prepara Maria e Allan
  // → 3) conversa em tempo real (precisa começar com a conversa vazia)
  // → 4) demais testes no desktop e no celular, em paralelo (eles também mandam mensagens).
  projects: [
    {
      name: "admin-flow",
      testMatch: /admin-panel\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "seed-participants",
      testMatch: /seed-participants\.setup\.ts/,
      dependencies: ["admin-flow"],
    },
    {
      name: "conversation",
      testMatch: /chat\.spec\.ts/,
      dependencies: ["seed-participants"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop",
      testIgnore: [/admin-panel\.spec\.ts/, /\.setup\.ts/, /chat\.spec\.ts/],
      dependencies: ["conversation"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: [/admin-panel\.spec\.ts/, /\.setup\.ts/, /chat\.spec\.ts/],
      dependencies: ["conversation"],
      use: { ...devices["Pixel 7"] },
    },
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
