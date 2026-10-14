import { defineConfig, devices } from "@playwright/test";
import { E2E, PROD } from "./tests/e2e/env";

const IGNORE = [
  /admin-panel\.spec\.ts/,
  /\.setup\.ts/,
  /chat\.spec\.ts/,
  /username\.spec\.ts/,
  /personal\.spec\.ts/,
];

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
      // aviso de novas mensagens: depende de mensagens não lidas, então roda sozinho
      name: "notice",
      testMatch: /username\.spec\.ts/,
      dependencies: ["conversation"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // apagar para mim, limpar conversa e minha foto: mexe na conversa toda, roda sozinho
      name: "personal",
      testMatch: /personal\.spec\.ts/,
      dependencies: ["notice"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop",
      testIgnore: IGNORE,
      dependencies: ["personal"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: IGNORE,
      dependencies: ["personal"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    // E2E_PROD=1 testa o build de produção (CSP sem eval, cookies __Host-, sem recarga automática)
    command: PROD ? "npm start" : "npm run dev",
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
