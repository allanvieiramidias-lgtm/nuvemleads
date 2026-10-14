import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { trustedDevices } from "@/db/schema";
import { getActiveConversation } from "@/server/conversations";
import { forgetDevice, getDevice, rememberDevice } from "@/server/devices";
import { DomainError } from "@/server/errors";
import { createTextMessage, markRead } from "@/server/messages";
import { getUnreadNotice } from "@/server/notice";
import { loginWithPin, PIN_INVALID, PIN_TOO_MANY } from "@/server/participant-auth";
import { pinRetryAfter, registerPinFailure } from "@/server/pin-limits";
import { getSettings, updateSettings } from "@/server/settings";
import { changeUserPin, createUser, setUserStatus, updateUserProfile } from "@/server/users";
import { resetDb } from "./helpers";

// DECISOES §29: usuário + PIN pela página principal, aparelho lembrado e aviso de novas mensagens.
beforeEach(resetDb);

const PIN = "246810";
const maria = () =>
  createUser(db, { name: "Maria Clara", username: "maria", pin: PIN, status: "ACTIVE" });
const allan = () =>
  createUser(db, { name: "Allan Souza", username: "allan", pin: "905317", status: "ACTIVE" });

async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return e as DomainError;
}

describe("usuário das pessoas", () => {
  it("cria com o usuário informado (minúsculo) e recusa repetido ou fora do formato", async () => {
    const m = await createUser(db, {
      name: "Maria Clara",
      username: "  Maria ",
      pin: PIN,
      status: "ACTIVE",
    });
    expect(m.username).toBe("maria");
    const dup = await errorOf(
      createUser(db, { name: "Maria Outra", username: "maria", pin: PIN, status: "INACTIVE" }),
    );
    expect(dup.fields).toEqual({ username: "Este usuário já está em uso." });
    for (const bad of ["ab", "joão", "com espaço", "x".repeat(25), "a/b"]) {
      const e = await errorOf(
        createUser(db, { name: "Fulano", username: bad, pin: PIN, status: "INACTIVE" }),
      );
      expect(e.fields?.username, bad).toMatch(/Use de 3 a 24/);
    }
  });

  it("sem usuário, gera a partir do primeiro nome sem acento, sem repetir", async () => {
    const a = await createUser(db, { name: "João Lima", pin: PIN, status: "ACTIVE" });
    const b = await createUser(db, { name: "Joao Pedro", pin: PIN, status: "ACTIVE" });
    const c = await createUser(db, { name: "Lú", pin: PIN, status: "INACTIVE" });
    expect([a.username, b.username, c.username]).toEqual(["joao", "joao2", "lupessoa"]);
  });

  it("edita o usuário; não deixa pegar o de outra pessoa", async () => {
    const m = await maria();
    const a = await allan();
    expect((await updateUserProfile(db, m.id, { username: "mclara" })).username).toBe("mclara");
    const e = await errorOf(updateUserProfile(db, a.id, { username: "mclara" }));
    expect(e.fields).toEqual({ username: "Este usuário já está em uso." });
    // o próprio usuário pode ser salvo de novo
    expect((await updateUserProfile(db, m.id, { username: "mclara" })).username).toBe("mclara");
  });
});

describe("entrar com usuário + PIN", () => {
  it("usuário certo e PIN certo abrem a sessão (com maiúsculas e espaços também)", async () => {
    const m = await maria();
    const r = await loginWithPin(db, { username: " MARIA ", pin: PIN, ip: "10.1.0.1" });
    expect(r).toMatchObject({ userId: m.id, slug: m.slug, pinVersion: 1 });
  });

  it("usuário inexistente ou inativo responde igual a PIN errado, com os mesmos limites", async () => {
    const m = await maria();
    const wrongPin = await errorOf(
      loginWithPin(db, { username: "maria", pin: "111222", ip: "10.1.0.2" }),
    );
    const ghost = await errorOf(
      loginWithPin(db, { username: "fantasma", pin: "111222", ip: "10.1.0.2" }),
    );
    expect([wrongPin.code, wrongPin.message, wrongPin.fields]).toEqual([
      ghost.code,
      ghost.message,
      ghost.fields,
    ]);
    expect(ghost.message).toBe(PIN_INVALID);
    // 3 erros no mesmo "usuário" inexistente → espera, como para uma pessoa de verdade
    await errorOf(loginWithPin(db, { username: "fantasma", pin: "111222", ip: "10.1.0.2" }));
    const third = await errorOf(
      loginWithPin(db, { username: "fantasma", pin: "111222", ip: "10.1.0.2" }),
    );
    expect(third.code).toBe("TOO_MANY");
    expect(third.message).toBe(PIN_TOO_MANY);

    await setUserStatus(db, m.id, "INACTIVE");
    const inactive = await errorOf(
      loginWithPin(db, { username: "maria", pin: PIN, ip: "10.1.0.3" }),
    );
    expect(inactive.code).toBe("INVALID_PIN");
  });

  it("20 erros do mesmo IP, em qualquer usuário, bloqueiam o IP por 15 min", async () => {
    const ip = "10.1.0.9";
    for (let i = 0; i < 20; i++) await registerPinFailure(db, `name:u${i}`, ip);
    expect(await pinRetryAfter(db, "name:qualquer", ip)).toBeGreaterThan(14 * 60);
    expect(await pinRetryAfter(db, "name:qualquer", "10.1.0.10")).toBe(0);
  });
});

describe("aparelho lembrado", () => {
  it("lembra por 180 dias, renova o mesmo token e esquece ao trocar", async () => {
    const m = await maria();
    const token = await rememberDevice(db, { userId: m.id, pinVersion: 1 });
    expect(await getDevice(db, token)).toMatchObject({ userId: m.id, slug: m.slug });
    const [row] = await db.select().from(trustedDevices);
    const days = (row!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(179.9);
    expect(days).toBeLessThanOrEqual(180);

    expect(await rememberDevice(db, { userId: m.id, pinVersion: 1, currentToken: token })).toBe(
      token,
    );
    expect(await db.select().from(trustedDevices)).toHaveLength(1);

    await forgetDevice(db, token);
    expect(await getDevice(db, token)).toBeNull();
  });

  it("token de outra pessoa não é renovado: vira um aparelho novo", async () => {
    const m = await maria();
    const a = await allan();
    const tm = await rememberDevice(db, { userId: m.id, pinVersion: 1 });
    const ta = await rememberDevice(db, { userId: a.id, pinVersion: 1, currentToken: tm });
    expect(ta).not.toBe(tm);
    expect((await getDevice(db, ta))?.userId).toBe(a.id);
  });

  it("trocar o PIN ou desativar a pessoa invalida o aparelho; vencido também não vale", async () => {
    const m = await maria();
    const t1 = await rememberDevice(db, { userId: m.id, pinVersion: 1 });
    await changeUserPin(db, m.id, "905317");
    expect(await getDevice(db, t1)).toBeNull();

    const t2 = await rememberDevice(db, { userId: m.id, pinVersion: 2 });
    await setUserStatus(db, m.id, "INACTIVE");
    expect(await getDevice(db, t2)).toBeNull();
    await setUserStatus(db, m.id, "ACTIVE");

    const t3 = await rememberDevice(db, { userId: m.id, pinVersion: 2 });
    await db.update(trustedDevices).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getDevice(db, t3)).toBeNull();
    expect(await getDevice(db, "token-que-nao-existe")).toBeNull();
    expect(await getDevice(db, null)).toBeNull();
  });
});

describe("aviso de novas mensagens", () => {
  it("só sim ou não: liga com mensagem não lida da outra pessoa, apaga ao ler", async () => {
    const m = await maria();
    const a = await allan();
    const conv = (await getActiveConversation(db))!;
    expect(await getUnreadNotice(db, m.id)).toEqual({ enabled: true, unread: false });

    // mensagem da própria pessoa não conta
    await createTextMessage(db, conv, m.id, { clientId: crypto.randomUUID(), body: "Oi" });
    expect((await getUnreadNotice(db, m.id)).unread).toBe(false);

    const { message } = await createTextMessage(db, conv, a.id, {
      clientId: crypto.randomUUID(),
      body: "Chegou?",
    });
    expect(await getUnreadNotice(db, m.id)).toEqual({ enabled: true, unread: true });
    // o "Oi" da Maria ainda não foi lido pelo Allan
    expect((await getUnreadNotice(db, a.id)).unread).toBe(true);

    await markRead(db, conv, m.id, message.id!);
    expect((await getUnreadNotice(db, m.id)).unread).toBe(false);
  });

  it("desligado no painel: não informa nada; quem está fora da conversa também não", async () => {
    const m = await maria();
    const a = await allan();
    const conv = (await getActiveConversation(db))!;
    await createTextMessage(db, conv, a.id, { clientId: crypto.randomUUID(), body: "Oi" });
    await updateSettings(db, {
      autoLockMinutes: 5,
      lockOnTabLeave: true,
      lockOnReopen: true,
      unreadNotice: false,
    });
    expect(await getUnreadNotice(db, m.id)).toEqual({ enabled: false, unread: false });

    await updateSettings(db, {
      autoLockMinutes: 5,
      lockOnTabLeave: true,
      lockOnReopen: true,
      unreadNotice: true,
    });
    const outsider = await createUser(db, { name: "Fora", pin: PIN, status: "INACTIVE" });
    expect(await getUnreadNotice(db, outsider.id)).toEqual({ enabled: true, unread: false });
  });

  it("salvar as configurações sem o campo mantém o aviso como estava", async () => {
    await updateSettings(db, {
      autoLockMinutes: 5,
      lockOnTabLeave: true,
      lockOnReopen: true,
      unreadNotice: false,
    });
    await updateSettings(db, { autoLockMinutes: 15, lockOnTabLeave: true, lockOnReopen: true });
    expect(await getSettings(db)).toMatchObject({ autoLockMinutes: 15, unreadNotice: false });
  });
});

it("apagar a pessoa apaga os aparelhos dela (sem lixo no banco)", async () => {
  const m = await maria();
  await rememberDevice(db, { userId: m.id, pinVersion: 1 });
  await changeUserPin(db, m.id, "905317");
  expect(await db.select().from(trustedDevices).where(eq(trustedDevices.userId, m.id))).toEqual([]);
});
