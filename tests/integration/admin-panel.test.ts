import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adminSessions, admins, attachments, messages, rateLimits } from "@/db/schema";
import { hashSecret } from "@/lib/auth/hash";
import { formatAgo, formatDay, formatDayTime } from "@/lib/time";
import { changeAdminPassword, updateAccount, WRONG_CURRENT_PASSWORD } from "@/server/admin-account";
import { getAdminByToken, loginAdmin } from "@/server/admin-auth";
import { AVATAR_FORMAT_ERROR, readAvatar, saveAvatar } from "@/server/avatars";
import { getActiveConversation } from "@/server/conversations";
import { getDashboard, resetPinAttempts } from "@/server/dashboard";
import { DomainError } from "@/server/errors";
import { on } from "@/server/events";
import { getSettings, updateSettings } from "@/server/settings";
import { changeUserPin, createUser, setUserStatus } from "@/server/users";
import { resetDb } from "./helpers";

beforeEach(resetDb);

async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return e as DomainError;
}

describe("painel (README §4.7)", () => {
  it("conta mensagens e arquivos da conversa atual e nunca devolve o conteúdo", async () => {
    const maria = await createUser(db, {
      name: "Maria Clara",
      pin: "246810",
      status: "ACTIVE",
      tone: "ACCENT",
    });
    await createUser(db, { name: "Allan Souza", pin: "905317", status: "ACTIVE" });
    const conv = (await getActiveConversation(db))!;
    const [att] = await db
      .insert(attachments)
      .values({
        uploaderId: maria.id,
        kind: "IMAGE",
        storageKey: "x/y.jpg",
        mime: "image/jpeg",
        sizeBytes: 10,
        originalName: "vista.jpg",
        status: "READY",
      })
      .returning();
    await db.insert(messages).values([
      {
        conversationId: conv.id,
        clientId: crypto.randomUUID(),
        senderId: maria.id,
        kind: "TEXT",
        body: "SEGREDO-123",
        createdAt: new Date(Date.now() - 2000),
      },
      {
        conversationId: conv.id,
        clientId: crypto.randomUUID(),
        senderId: maria.id,
        kind: "IMAGE",
        body: "legenda secreta",
        attachmentId: att!.id,
      },
    ]);

    const d = await getDashboard(db);
    expect(d.activeUsers).toBe(2);
    expect(d.messageCount).toBe(2);
    expect(d.fileCount).toBe(1);
    expect(d.lastActivity?.firstName).toBe("Maria");
    expect(d.recent.map((r) => r.kind)).toEqual(["IMAGE", "TEXT"]);
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain("SEGREDO");
    expect(serialized).not.toContain("legenda");
    expect(serialized).not.toContain("vista.jpg");
  });

  it("sem par ativo, os contadores ficam zerados", async () => {
    await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
    const d = await getDashboard(db);
    expect(d).toMatchObject({
      activeUsers: 1,
      messageCount: 0,
      fileCount: 0,
      lastActivity: null,
      recent: [],
    });
  });

  it("mostra alerta com 10+ erros de PIN e 'Liberar tentativas' zera", async () => {
    const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
    await db.insert(rateLimits).values([
      { key: `pin-user:${maria.id}`, count: 12 },
      { key: `pin:${maria.id}:1.2.3.4`, count: 3 },
    ]);
    expect((await getDashboard(db)).pinAlerts).toEqual([{ userId: maria.id, firstName: "Maria" }]);
    await resetPinAttempts(db, maria.id);
    expect((await getDashboard(db)).pinAlerts).toEqual([]);
    expect(await db.select().from(rateLimits)).toHaveLength(0);
  });
});

describe("avisos para o tempo real", () => {
  it("desativar e trocar PIN avisam session:revoked", async () => {
    const got: string[] = [];
    const off = on("session:revoked", (e) => got.push(e.reason));
    const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
    await changeUserPin(db, maria.id, "905317");
    await setUserStatus(db, maria.id, "INACTIVE");
    off();
    expect(got).toEqual(["PIN_CHANGED", "DEACTIVATED"]);
  });
});

describe("configurações (README §4.10)", () => {
  it("padrão 5 min / ligado / ligado e salva com aviso settings:updated", async () => {
    expect(await getSettings(db)).toEqual({
      autoLockMinutes: 5,
      lockOnTabLeave: true,
      lockOnReopen: true,
    });
    let seen: unknown = null;
    const off = on("settings:updated", (s) => (seen = s));
    await updateSettings(db, { autoLockMinutes: 15, lockOnTabLeave: false, lockOnReopen: true });
    off();
    expect(await getSettings(db)).toEqual({
      autoLockMinutes: 15,
      lockOnTabLeave: false,
      lockOnReopen: true,
    });
    expect(seen).toEqual({ autoLockMinutes: 15, lockOnTabLeave: false, lockOnReopen: true });
  });

  it("recusa tempo fora de 1/5/15/30", async () => {
    await expect(
      updateSettings(db, { autoLockMinutes: 7 as 5, lockOnTabLeave: true, lockOnReopen: true }),
    ).rejects.toThrow();
  });
});

describe("conta do admin", () => {
  async function seedAdmin() {
    await db.insert(admins).values({
      name: "Renata Alves",
      email: "renata@ex.com",
      passwordHash: await hashSecret("senha-antiga-1"),
    });
    const [a] = await db.select().from(admins);
    return a!;
  }

  it("atualiza nome e e-mail; recusa e-mail de outro admin", async () => {
    const a = await seedAdmin();
    await db.insert(admins).values({ name: "Outra", email: "outra@ex.com", passwordHash: "x" });
    expect(
      await updateAccount(db, a.id, { name: "Renata A.", email: " Renata@Novo.com " }),
    ).toEqual({
      name: "Renata A.",
      email: "renata@novo.com",
    });
    expect(
      (await errorOf(updateAccount(db, a.id, { name: "Renata", email: "outra@ex.com" }))).fields,
    ).toHaveProperty("email");
  });

  it("alterar senha exige a atual, mantém esta sessão e encerra as outras", async () => {
    const a = await seedAdmin();
    const s1 = await loginAdmin(db, { email: a.email, password: "senha-antiga-1", ip: "1" });
    const s2 = await loginAdmin(db, { email: a.email, password: "senha-antiga-1", ip: "2" });
    expect(
      (
        await errorOf(
          changeAdminPassword(db, a.id, { current: "errada", next: "nova-senha-123" }, s1.token),
        )
      ).message,
    ).toBe(WRONG_CURRENT_PASSWORD);
    expect(
      (
        await errorOf(
          changeAdminPassword(db, a.id, { current: "senha-antiga-1", next: "curta" }, s1.token),
        )
      ).code,
    ).toBe("VALIDATION");
    await changeAdminPassword(
      db,
      a.id,
      { current: "senha-antiga-1", next: "nova-senha-123" },
      s1.token,
    );
    expect(await getAdminByToken(db, s1.token)).not.toBeNull();
    expect(await getAdminByToken(db, s2.token)).toBeNull();
    expect(
      await db.select().from(adminSessions).where(eq(adminSessions.adminId, a.id)),
    ).toHaveLength(1);
  });
});

describe("foto de perfil", () => {
  it("converte para webp 256×256 e remove metadados", async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#806040" },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "GPS-SECRETO" } } })
      .toBuffer();
    const key = await saveAvatar(jpeg);
    expect(key).toMatch(/^avatars\/[0-9a-f-]{36}\.webp$/);
    const out = (await readAvatar(key))!;
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
  });

  it("recusa o que não é JPG/PNG/WEBP pelos bytes", async () => {
    expect(
      (await errorOf(saveAvatar(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")))).message,
    ).toBe(AVATAR_FORMAT_ERROR);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    expect((await errorOf(saveAvatar(gif))).message).toBe(AVATAR_FORMAT_ERROR);
  });
});

describe("textos de data", () => {
  const now = new Date("2026-10-12T15:00:00Z"); // 12:00 em Brasília
  it("Hoje / Ontem / data por extenso, no fuso de Brasília", () => {
    expect(formatDayTime(new Date("2026-10-12T12:40:00Z"), now)).toBe("Hoje, 09:40");
    expect(formatDayTime(new Date("2026-10-12T02:30:00Z"), now)).toBe("Ontem, 23:30");
    expect(formatDay(new Date("2026-03-12T15:00:00Z"), now)).toBe("12 de março");
    expect(formatDay(new Date("2025-03-12T15:00:00Z"), now)).toBe("12 de março de 2025");
  });
  it("há quanto tempo", () => {
    expect(formatAgo(new Date("2026-10-12T13:00:00Z"), now)).toBe("hoje");
    expect(formatAgo(new Date("2026-10-07T13:00:00Z"), now)).toBe("há 5 dias");
    expect(formatAgo(new Date("2026-07-12T13:00:00Z"), now)).toBe("há 3 meses");
  });
});
