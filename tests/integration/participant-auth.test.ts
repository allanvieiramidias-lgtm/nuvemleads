import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { rateLimits, userSessions, users } from "@/db/schema";
import { getDashboard } from "@/server/dashboard";
import { DomainError } from "@/server/errors";
import {
  bootSession,
  getPublicProfile,
  getSessionByToken,
  LINK_INVALID,
  loginWithPin,
  logoutSession,
  PIN_INVALID,
} from "@/server/participant-auth";
import { pinRetryAfter, registerPinFailure } from "@/server/pin-limits";
import { updateSettings } from "@/server/settings";
import { changeUserPin, createUser, setUserStatus } from "@/server/users";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const PIN = "246810";
async function maria() {
  return createUser(db, { name: "Maria Clara", pin: PIN, status: "ACTIVE", tone: "ACCENT" });
}
async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return e as DomainError;
}
const login = (slug: string, pin: string, ip = "10.0.0.1") => loginWithPin(db, { slug, pin, ip });

describe("tela de PIN: dados públicos", () => {
  it("mostra nome, iniciais e tom; inativo ou link errado → null", async () => {
    const m = await maria();
    expect(await getPublicProfile(db, m.slug)).toMatchObject({
      name: "Maria Clara",
      firstName: "Maria",
      initials: "MC",
      tone: "ACCENT",
      pinChangedByAdmin: false,
    });
    expect(await getPublicProfile(db, "naoexiste123")).toBeNull();
    expect(await getPublicProfile(db, "../../etc")).toBeNull();
    await setUserStatus(db, m.id, "INACTIVE");
    expect(await getPublicProfile(db, m.slug)).toBeNull();
  });

  it("avisa uma vez que o admin trocou o PIN; some depois do login", async () => {
    const m = await maria();
    await changeUserPin(db, m.id, "905317");
    expect((await getPublicProfile(db, m.slug))?.pinChangedByAdmin).toBe(true);
    await login(m.slug, "905317");
    expect((await getPublicProfile(db, m.slug))?.pinChangedByAdmin).toBe(false);
  });
});

describe("login por PIN", () => {
  it("PIN certo cria sessão nova (fresh) e o link errado dá aviso", async () => {
    const m = await maria();
    const { token } = await login(m.slug, PIN);
    const s = await getSessionByToken(db, token);
    expect(s).toMatchObject({ locked: false, user: { id: m.id, name: "Maria Clara" } });
    const [row] = await db.select().from(userSessions);
    expect(row!.fresh).toBe(true);
    expect(row!.tokenHash).not.toBe(token);
    expect((await errorOf(login("naoexiste123", PIN))).message).toBe(LINK_INVALID);
  });

  it("1º e 2º erros: 401 com tentativas restantes; 3º: espera de 15 s", async () => {
    const m = await maria();
    const e1 = await errorOf(login(m.slug, "111111"));
    expect(e1).toMatchObject({
      code: "INVALID_PIN",
      message: PIN_INVALID,
      fields: { attemptsLeft: "2" },
    });
    expect((await errorOf(login(m.slug, "222222"))).fields?.attemptsLeft).toBe("1");
    const e3 = await errorOf(login(m.slug, "333333"));
    expect(e3.code).toBe("TOO_MANY");
    expect(Number(e3.fields?.retryAfter)).toBe(15);
    // durante a espera, nem o PIN certo entra
    expect((await errorOf(login(m.slug, PIN))).code).toBe("TOO_MANY");
    // outro IP não é afetado
    await expect(login(m.slug, PIN, "10.0.0.2")).resolves.toHaveProperty("token");
  });

  it("5 erros em 15 min no mesmo IP → 15 min", async () => {
    const m = await maria();
    const t0 = new Date("2026-10-12T12:00:00Z");
    let last = { retryAfter: 0, attemptsLeft: 0 };
    for (let i = 0; i < 5; i++)
      last = await registerPinFailure(db, m.id, "ip", new Date(t0.getTime() + i * 20_000));
    expect(last.retryAfter).toBe(900);
  });

  it("10+ erros por pessoa em 24 h (vários IPs): espera progressiva, nunca permanente, e aviso no painel", async () => {
    const m = await maria();
    const t0 = new Date("2026-10-12T12:00:00Z");
    const waits: number[] = [];
    for (let i = 0; i < 12; i++) {
      // um IP diferente a cada erro: o limite por IP nunca dispara
      const r = await registerPinFailure(db, m.id, `ip-${i}`, new Date(t0.getTime() + i * 1000));
      waits.push(r.retryAfter);
    }
    expect(waits.slice(0, 9).every((w) => w === 0)).toBe(true);
    expect(waits.slice(9)).toEqual([30, 60, 120]);
    expect(
      await pinRetryAfter(db, m.id, "ip-novo", new Date(t0.getTime() + 12_000)),
    ).toBeGreaterThan(0);
    // depois da espera, libera de novo
    expect(await pinRetryAfter(db, m.id, "ip-novo", new Date(t0.getTime() + 20 * 60_000))).toBe(0);
    // o contador real usa o relógio do banco; força o aviso com a janela atual
    await db
      .update(rateLimits)
      .set({ windowStart: new Date() })
      .where(eq(rateLimits.key, `pin-user:${m.id}`));
    expect((await getDashboard(db)).pinAlerts).toEqual([{ userId: m.id, firstName: "Maria" }]);
  });

  it("acertar zera o contador do IP", async () => {
    const m = await maria();
    await errorOf(login(m.slug, "111111"));
    await errorOf(login(m.slug, "222222"));
    await login(m.slug, PIN);
    expect((await errorOf(login(m.slug, "111111"))).fields?.attemptsLeft).toBe("2");
  });

  it("formato inválido conta como erro, sem quebrar", async () => {
    const m = await maria();
    expect((await errorOf(login(m.slug, "12ab"))).code).toBe("INVALID_PIN");
  });
});

describe("validade da sessão", () => {
  it("cai ao trocar o PIN, ao desativar e ao sair", async () => {
    const m = await maria();
    const a = await login(m.slug, PIN);
    await db.update(userSessions).set({ pinVersion: 0 }); // simula PIN trocado sem apagar a linha
    expect(await getSessionByToken(db, a.token)).toBeNull();

    const b = await login(m.slug, PIN);
    await db.update(users).set({ status: "INACTIVE" }).where(eq(users.id, m.id));
    expect(await getSessionByToken(db, b.token)).toBeNull();
    await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, m.id));

    const c = await login(m.slug, PIN);
    await logoutSession(db, c.token);
    expect(await getSessionByToken(db, c.token)).toBeNull();

    const d = await login(m.slug, PIN);
    await db.update(userSessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getSessionByToken(db, d.token)).toBeNull();
  });
});

describe("reabrir a página (DECISOES §7)", () => {
  it("1º carregamento entra; recarregar bloqueia com REOPEN", async () => {
    const m = await maria();
    const { token } = await login(m.slug, PIN);
    const first = await bootSession(db, (await getSessionByToken(db, token))!);
    expect(first.locked).toBe(false);
    const second = await bootSession(db, (await getSessionByToken(db, token))!);
    expect(second).toMatchObject({ locked: true, lockReason: "REOPEN" });
    expect((await getSessionByToken(db, token))!.locked).toBe(true);
  });

  it("com 'Exigir PIN ao reabrir' desligado, recarregar não bloqueia", async () => {
    await updateSettings(db, { autoLockMinutes: 5, lockOnTabLeave: true, lockOnReopen: false });
    const m = await maria();
    const { token } = await login(m.slug, PIN);
    await bootSession(db, (await getSessionByToken(db, token))!);
    expect((await bootSession(db, (await getSessionByToken(db, token))!)).locked).toBe(false);
  });
});
