import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { messages, userSessions, users } from "@/db/schema";
import { verifySecret } from "@/lib/auth/hash";
import { newSessionToken } from "@/lib/auth/tokens";
import { MSG } from "@/lib/validators";
import { getActiveConversation } from "@/server/conversations";
import { DomainError } from "@/server/errors";
import {
  changeUserPin,
  countActive,
  createUser,
  defaultStatusForNewUser,
  setUserStatus,
} from "@/server/users";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const mk = (name: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE", pin = "246810") =>
  createUser(db, { name, pin, status });

async function expectDomainError(p: Promise<unknown>, code: string, message?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  if (message) expect((err as DomainError).message).toBe(message);
}

async function addSession(userId: string) {
  const { tokenHash } = newSessionToken();
  await db.insert(userSessions).values({
    tokenHash,
    userId,
    pinVersion: 1,
    expiresAt: new Date(Date.now() + 3600_000),
  });
}

describe("regra de no máximo 2 usuários ativos", () => {
  it("cria até 2 ativos e recusa o terceiro com o texto do README", async () => {
    await mk("Maria Clara");
    await mk("Allan Souza");
    await expectDomainError(mk("João Lima"), "ROOM_FULL", MSG.roomFullForm);
    expect(await countActive(db)).toBe(2);
  });

  it("permite criar um terceiro como Inativo, e o padrão já vem Inativo", async () => {
    await mk("Maria Clara");
    expect(await defaultStatusForNewUser(db)).toBe("ACTIVE");
    await mk("Allan Souza");
    expect(await defaultStatusForNewUser(db)).toBe("INACTIVE");
    const joao = await mk("João Lima", "INACTIVE");
    expect(joao.status).toBe("INACTIVE");
  });

  it("ativar um terceiro falha; depois de desativar alguém, funciona", async () => {
    const maria = await mk("Maria Clara");
    await mk("Allan Souza");
    const joao = await mk("João Lima", "INACTIVE");
    await expectDomainError(setUserStatus(db, joao.id, "ACTIVE"), "ROOM_FULL", MSG.roomFull);
    await setUserStatus(db, maria.id, "INACTIVE");
    expect((await setUserStatus(db, joao.id, "ACTIVE")).status).toBe("ACTIVE");
    expect(await countActive(db)).toBe(2);
  });

  it("aguenta ativações simultâneas sem passar de 2", async () => {
    const pessoas = await Promise.all(
      ["A1", "B2", "C3", "D4", "E5"].map((n) => mk(`Pessoa ${n}`, "INACTIVE")),
    );
    const results = await Promise.allSettled(pessoas.map((p) => setUserStatus(db, p.id, "ACTIVE")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await countActive(db)).toBe(2);
  });

  it("criações simultâneas como Ativo também param em 2", async () => {
    const results = await Promise.allSettled(
      ["A1", "B2", "C3", "D4"].map((n) => mk(`Pessoa ${n}`)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await countActive(db)).toBe(2);
  });

  it("desativar encerra as sessões da pessoa", async () => {
    const maria = await mk("Maria Clara");
    await addSession(maria.id);
    await setUserStatus(db, maria.id, "INACTIVE");
    expect(
      await db.select().from(userSessions).where(eq(userSessions.userId, maria.id)),
    ).toHaveLength(0);
  });
});

describe("criação e PIN", () => {
  it("recusa PIN fraco no servidor", async () => {
    await expectDomainError(mk("Maria Clara", "ACTIVE", "123456"), "VALIDATION", MSG.pinWeak);
    await expectDomainError(mk("Maria Clara", "ACTIVE", "777777"), "VALIDATION", MSG.pinWeak);
    await expectDomainError(mk("Maria Clara", "ACTIVE", "12345"), "VALIDATION", MSG.pinFormat);
  });

  it("nunca devolve o hash do PIN e gera link pessoal", async () => {
    const maria = await mk("Maria Clara");
    expect(maria).not.toHaveProperty("pinHash");
    expect(maria.slug).toMatch(/^[a-z0-9]{12}$/);
    const [row] = await db.select().from(users).where(eq(users.id, maria.id));
    expect(await verifySecret(row!.pinHash, "246810")).toBe(true);
  });

  it("trocar o PIN derruba sessões, sobe a versão e marca o aviso", async () => {
    const maria = await mk("Maria Clara");
    await addSession(maria.id);
    const updated = await changeUserPin(db, maria.id, "905317");
    expect(updated.pinVersion).toBe(2);
    expect(updated.pinNoticeSeen).toBe(false);
    expect(updated.pinChangedByAdminAt).toBeInstanceOf(Date);
    expect(
      await db.select().from(userSessions).where(eq(userSessions.userId, maria.id)),
    ).toHaveLength(0);
    const [row] = await db.select().from(users).where(eq(users.id, maria.id));
    expect(await verifySecret(row!.pinHash, "246810")).toBe(false);
    expect(await verifySecret(row!.pinHash, "905317")).toBe(true);
  });
});

describe("conversa do par ativo (DECISOES §3)", () => {
  it("sem duas pessoas ativas não há conversa", async () => {
    expect(await getActiveConversation(db)).toBeNull();
    await mk("Maria Clara");
    expect(await getActiveConversation(db)).toBeNull();
  });

  it("trocar uma pessoa leva a uma conversa nova; reativar a dupla antiga volta à conversa dela", async () => {
    const maria = await mk("Maria Clara");
    const allan = await mk("Allan Souza");
    const conv1 = (await getActiveConversation(db))!;
    await db.insert(messages).values({
      conversationId: conv1.id,
      clientId: crypto.randomUUID(),
      senderId: maria.id,
      kind: "TEXT",
      body: "Oi, Allan",
    });

    // Admin troca Maria por João: João não vê o histórico de Maria e Allan
    await setUserStatus(db, maria.id, "INACTIVE");
    const joao = await mk("João Lima");
    const conv2 = (await getActiveConversation(db))!;
    expect(conv2.id).not.toBe(conv1.id);
    expect(
      await db.select().from(messages).where(eq(messages.conversationId, conv2.id)),
    ).toHaveLength(0);

    // Volta a dupla original: a conversa antiga reaparece
    await setUserStatus(db, joao.id, "INACTIVE");
    await setUserStatus(db, maria.id, "ACTIVE");
    const conv3 = (await getActiveConversation(db))!;
    expect(conv3.id).toBe(conv1.id);
    expect([conv3.userAId, conv3.userBId].sort()).toEqual([maria.id, allan.id].sort());
  });

  it("chamadas simultâneas não criam conversas duplicadas", async () => {
    await mk("Maria Clara");
    await mk("Allan Souza");
    const all = await Promise.all(Array.from({ length: 6 }, () => getActiveConversation(db)));
    expect(new Set(all.map((c) => c!.id)).size).toBe(1);
  });
});

describe("restrições no banco", () => {
  it("mensagem de texto exige corpo", async () => {
    const maria = await mk("Maria Clara");
    await mk("Allan Souza");
    const conv = (await getActiveConversation(db))!;
    await expect(
      db
        .insert(messages)
        .values({
          conversationId: conv.id,
          clientId: crypto.randomUUID(),
          senderId: maria.id,
          kind: "TEXT",
        }),
    ).rejects.toThrow();
  });

  it("o mesmo clientId do mesmo remetente não duplica (idempotência)", async () => {
    const maria = await mk("Maria Clara");
    await mk("Allan Souza");
    const conv = (await getActiveConversation(db))!;
    const clientId = crypto.randomUUID();
    const row = {
      conversationId: conv.id,
      clientId,
      senderId: maria.id,
      kind: "TEXT" as const,
      body: "Oi",
    };
    await db.insert(messages).values(row);
    await expect(db.insert(messages).values(row)).rejects.toThrow();
  });
});
