import path from "node:path";

export const E2E = {
  port: 3100,
  databaseUrl:
    process.env.E2E_DATABASE_URL ?? "postgresql://nuvem:nuvem-dev@localhost:5432/nuvemleads_e2e",
  outbox: path.resolve(".data/e2e-outbox"),
  adminEmail: "renata@e2e.test",
  adminPassword: "senha-de-teste-123",
};
