import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adminSessions, admins } from "@/db/schema";
import { hashSecret } from "@/lib/auth/hash";
import { ADMIN_LOGIN_RULE, registerHit, retryAfter } from "@/lib/rate-limit";
import {
  ADMIN_LOGIN_ERROR,
  ADMIN_TOO_MANY,
  getAdminByToken,
  isResetTokenValid,
  loginAdmin,
  logoutAdmin,
  requestPasswordReset,
  resetPassword,
} from "@/server/admin-auth";
import { DomainError } from "@/server/errors";
import { resetDb } from "./helpers";

const OUTBOX = path.resolve(".data/test-outbox");
process.env.MAIL_OUTBOX = OUTBOX;

const EMAIL = "renata@exemplo.com.br";
const PASSWORD = "senha-forte-123";

beforeEach(async () => {
  await resetDb();
  await rm(OUTBOX, { recursive: true, force: true });
  await db
    .insert(admins)
    .values({ name: "Renata Alves", email: EMAIL, passwordHash: await hashSecret(PASSWORD) });
});

const login = (email: string, password: string, ip = "10.0.0.1") =>
  loginAdmin(db, { email, password, ip });

async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return e as DomainError;
}

async function lastResetLink(): Promise<string> {
  const files = (await readdir(OUTBOX)).sort();
  const mail = JSON.parse(await readFile(path.join(OUTBOX, files.at(-1)!), "utf8")) as {
    text: string;
    to: string;
  };
  const m = mail.text.match(/https?:\/\/\S+token=(\S+)/);
  return decodeURIComponent(m![1]!);
}

describe("login do admin", () => {
  it("entra com e-mail (sem diferenciar maiúsculas) e senha certos", async () => {
    const { token, admin } = await login("  Renata@Exemplo.com.BR ", PASSWORD);
    expect(admin.email).toBe(EMAIL);
    expect(await getAdminByToken(db, token)).toMatchObject({ email: EMAIL, name: "Renata Alves" });
  });

  it("guarda só o hash do token", async () => {
    const { token } = await login(EMAIL, PASSWORD);
    const rows = await db.select().from(adminSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
  });

  it("mesma mensagem genérica para senha errada e e-mail inexistente", async () => {
    expect((await errorOf(login(EMAIL, "errada-123456"))).message).toBe(ADMIN_LOGIN_ERROR);
    expect((await errorOf(login("ninguem@exemplo.com", PASSWORD))).message).toBe(ADMIN_LOGIN_ERROR);
  });

  it("5 erros no mesmo e-mail+IP bloqueiam por 15 min, inclusive a senha certa", async () => {
    for (let i = 0; i < 4; i++) expect((await errorOf(login(EMAIL, "x"))).code).toBe("FORBIDDEN");
    const fifth = await errorOf(login(EMAIL, "x"));
    expect(fifth.code).toBe("TOO_MANY");
    expect(fifth.message).toBe(ADMIN_TOO_MANY);
    expect(Number(fifth.fields?.retryAfter)).toBeGreaterThan(14 * 60);
    expect((await errorOf(login(EMAIL, PASSWORD))).code).toBe("TOO_MANY");
    // outro IP não é afetado
    await expect(login(EMAIL, PASSWORD, "10.0.0.2")).resolves.toHaveProperty("token");
  });

  it("acertar zera a contagem de erros", async () => {
    for (let i = 0; i < 4; i++) await errorOf(login(EMAIL, "x"));
    await login(EMAIL, PASSWORD);
    for (let i = 0; i < 4; i++) expect((await errorOf(login(EMAIL, "x"))).code).toBe("FORBIDDEN");
  });

  it("sair apaga a sessão; sessão vencida não vale", async () => {
    const { token } = await login(EMAIL, PASSWORD);
    await logoutAdmin(db, token);
    expect(await getAdminByToken(db, token)).toBeNull();

    const second = await login(EMAIL, PASSWORD);
    await db.update(adminSessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getAdminByToken(db, second.token)).toBeNull();
    expect(await getAdminByToken(db, "token-inventado")).toBeNull();
  });

  it("renovação deslizante estende o prazo da sessão", async () => {
    const { token } = await login(EMAIL, PASSWORD);
    const soon = new Date(Date.now() + 60 * 60_000); // falta 1 h
    await db.update(adminSessions).set({ expiresAt: soon });
    await getAdminByToken(db, token);
    const [row] = await db.select().from(adminSessions);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 7.9 * 3600_000);
  });
});

describe("limite de tentativas", () => {
  it("janela expirada recomeça a contagem", async () => {
    const rule = { max: 2, windowMs: 1000, blockMs: 5000 };
    const t0 = new Date("2026-01-01T00:00:00Z");
    expect(await registerHit(db, "k", rule, t0)).toBe(0);
    // 2 s depois a janela já passou: conta 1 de novo
    expect(await registerHit(db, "k", rule, new Date(t0.getTime() + 2000))).toBe(0);
    expect(await registerHit(db, "k", rule, new Date(t0.getTime() + 2500))).toBe(5);
    expect(await retryAfter(db, "k", new Date(t0.getTime() + 3500))).toBe(4);
    expect(await retryAfter(db, "k", new Date(t0.getTime() + 8000))).toBe(0);
  });

  it("tentativas simultâneas não se perdem", async () => {
    await Promise.all(Array.from({ length: 10 }, () => registerHit(db, "par", ADMIN_LOGIN_RULE)));
    expect(await retryAfter(db, "par")).toBeGreaterThan(0);
  });
});

describe("esqueci minha senha", () => {
  it("envia link, troca a senha, invalida o link e derruba as sessões", async () => {
    const { token: sessionToken } = await login(EMAIL, PASSWORD);
    await requestPasswordReset(db, {
      email: EMAIL,
      ip: "10.0.0.9",
      appUrl: "https://chat.exemplo.com.br",
    });
    const resetToken = await lastResetLink();
    expect(await isResetTokenValid(db, resetToken)).toBe(true);

    await resetPassword(db, { token: resetToken, password: "nova-senha-456" });
    expect(await isResetTokenValid(db, resetToken)).toBe(false);
    expect(await getAdminByToken(db, sessionToken)).toBeNull();
    await expect(login(EMAIL, "nova-senha-456")).resolves.toHaveProperty("token");
    expect((await errorOf(login(EMAIL, PASSWORD))).code).toBe("FORBIDDEN");

    const reuse = await errorOf(
      resetPassword(db, { token: resetToken, password: "outra-senha-789" }),
    );
    expect(reuse.code).toBe("NOT_FOUND");
  });

  it("e-mail inexistente não envia nada (e não dá erro)", async () => {
    await requestPasswordReset(db, {
      email: "ninguem@exemplo.com",
      ip: "10.0.0.9",
      appUrl: "http://x",
    });
    await expect(readdir(OUTBOX)).rejects.toThrow();
  });

  it("pedir de novo invalida o link anterior; link vencido não vale", async () => {
    await requestPasswordReset(db, { email: EMAIL, ip: "10.0.0.9", appUrl: "http://x" });
    const first = await lastResetLink();
    await new Promise((r) => setTimeout(r, 5));
    await requestPasswordReset(db, { email: EMAIL, ip: "10.0.0.9", appUrl: "http://x" });
    const second = await lastResetLink();
    expect(await isResetTokenValid(db, first)).toBe(false);
    expect(await isResetTokenValid(db, second)).toBe(true);
  });

  it("recusa senha curta", async () => {
    await requestPasswordReset(db, { email: EMAIL, ip: "10.0.0.9", appUrl: "http://x" });
    const e = await errorOf(resetPassword(db, { token: await lastResetLink(), password: "curta" }));
    expect(e.code).toBe("VALIDATION");
    const [a] = await db.select().from(admins).where(eq(admins.email, EMAIL));
    expect(a).toBeDefined();
  });
});
