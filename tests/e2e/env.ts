import { readFileSync } from "node:fs";
import path from "node:path";

export const E2E = {
  port: 3100,
  databaseUrl:
    process.env.E2E_DATABASE_URL ?? "postgresql://nuvem:nuvem-dev@localhost:5432/nuvemleads_e2e",
  outbox: path.resolve(".data/e2e-outbox"),
  adminEmail: "renata@e2e.test",
  adminPassword: "senha-de-teste-123",
};

/** Pessoas dos testes do participante: desktop usa Maria, celular usa Allan. */
export const PARTICIPANTS = [
  { key: "maria", name: "Maria Clara", tone: "ACCENT", pin: "905317", pinChangedNotice: false },
  { key: "allan", name: "Allan Souza", tone: "NEUTRAL", pin: "481526", pinChangedNotice: true },
] as const;

/** E2E_PROD=1: roda contra o build de produção (`npm run build` antes). */
export const PROD = process.env.E2E_PROD === "1";
/** Nome dos cookies: com o prefixo __Host- só em produção (DECISOES §14). */
export const cookieName = (base: "nl_admin" | "nl_user") => (PROD ? `__Host-${base}` : base);

export const STATE_FILE = path.resolve(".data/e2e-state.json");

export function participantFor(projectName: string) {
  const p = projectName === "mobile" ? PARTICIPANTS[1] : PARTICIPANTS[0];
  const slugs = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Record<string, string>;
  return { ...p, slug: slugs[p.key]! };
}
