import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attachments, messages } from "@/db/schema";
import { resolveKey } from "@/lib/storage";
import { getActiveConversation } from "@/server/conversations";
import { DomainError } from "@/server/errors";
import { on } from "@/server/events";
import { getAccessibleAttachment } from "@/server/media-access";
import {
  closeViewOnce,
  mediaStats,
  openViewOnce,
  purgeByRetention,
  purgeMedia,
  purgePreview,
  sweepViewOnce,
  VIEW_ONCE_GONE,
  VIEW_ONCE_GRACE_MS,
} from "@/server/media-lifecycle";
import { createAttachmentMessage, createTextMessage, listMessages } from "@/server/messages";
import { updateSettings } from "@/server/settings";
import { receiveUpload, storeUpload } from "@/server/uploads";
import { createUser } from "@/server/users";
import { resetDb } from "./helpers";

// DECISOES §30: visualização única e limpeza de mídias. Apagar é de verdade (banco e disco).
beforeEach(resetDb);

async function people() {
  const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
  const allan = await createUser(db, { name: "Allan Souza", pin: "905317", status: "ACTIVE" });
  return { maria, allan, conv: (await getActiveConversation(db))! };
}

async function photo(userId: string) {
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#4060a0" },
  })
    .jpeg()
    .toBuffer();
  const fd = new FormData();
  fd.append("kind", "media");
  fd.append("file", new Blob([new Uint8Array(bytes)]), "praia.jpg");
  return storeUpload(
    db,
    userId,
    await receiveUpload(new Request("http://x/api/uploads", { method: "POST", body: fd })),
  );
}

async function sendPhoto(
  conv: Awaited<ReturnType<typeof people>>["conv"],
  userId: string,
  opts: { viewOnce?: boolean; caption?: string } = {},
) {
  const up = await photo(userId);
  const { message } = await createAttachmentMessage(db, conv, userId, {
    clientId: crypto.randomUUID(),
    kind: "IMAGE",
    attachmentId: up.attachmentId,
    caption: opts.caption,
    viewOnce: opts.viewOnce,
  });
  const [att] = await db.select().from(attachments).where(eq(attachments.id, up.attachmentId));
  return { message, att: att! };
}

async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return e as DomainError;
}

describe("visualização única: texto", () => {
  it("a lista nunca traz o texto; abrir devolve uma vez e apaga do banco", async () => {
    const { maria, allan, conv } = await people();
    const { message } = await createTextMessage(db, conv, maria.id, {
      clientId: crypto.randomUUID(),
      body: "Segredo de hoje",
      viewOnce: true,
    });
    expect(message).toMatchObject({ viewOnce: true, opened: false, expired: false, body: null });

    for (const viewer of [maria.id, allan.id]) {
      const list = await listMessages(db, conv, viewer);
      expect(JSON.stringify(list)).not.toContain("Segredo de hoje");
    }

    // quem enviou não abre
    expect((await errorOf(openViewOnce(db, conv, maria.id, message.id))).code).toBe("NOT_FOUND");

    const updates: unknown[] = [];
    const off = on("message:updated", (e) => updates.push(e.message));
    const opened = await openViewOnce(db, conv, allan.id, message.id);
    off();
    expect(opened.body).toBe("Segredo de hoje");

    const [row] = await db.select().from(messages).where(eq(messages.id, message.id));
    expect(row!.body).toBeNull();
    expect(row!.openedAt).not.toBeNull();
    expect(row!.contentDeletedAt).not.toBeNull();
    expect(updates.at(-1)).toMatchObject({ opened: true, expired: true, body: null });

    const again = await errorOf(openViewOnce(db, conv, allan.id, message.id));
    expect([again.code, again.message]).toEqual(["GONE", VIEW_ONCE_GONE]);
  });
});

describe("visualização única: mídia", () => {
  it("sem miniatura nem download; só quem recebeu, só depois de abrir e por pouco tempo", async () => {
    const { maria, allan, conv } = await people();
    const { message, att } = await sendPhoto(conv, maria.id, {
      viewOnce: true,
      caption: "olha",
    });
    expect(message.attachment).toBeNull();
    expect(message.body).toBeNull();

    // antes de abrir: ninguém acessa (nem quem enviou)
    for (const u of [maria.id, allan.id])
      expect(await getAccessibleAttachment(db, att.id, u)).toBeNull();

    const opened = await openViewOnce(db, conv, allan.id, message.id);
    expect(opened).toMatchObject({ body: "olha", attachment: { id: att.id, kind: "IMAGE" } });

    expect(await getAccessibleAttachment(db, att.id, allan.id)).not.toBeNull();
    expect(await getAccessibleAttachment(db, att.id, allan.id, "thumb")).toBeNull();
    expect(await getAccessibleAttachment(db, att.id, allan.id, "download")).toBeNull();
    expect(await getAccessibleAttachment(db, att.id, maria.id)).toBeNull();
    const later = new Date(Date.now() + VIEW_ONCE_GRACE_MS + 1000);
    expect(await getAccessibleAttachment(db, att.id, allan.id, "file", later)).toBeNull();

    // fechar apaga o arquivo e a miniatura do disco
    const files = [att.storageKey, att.thumbKey].filter(Boolean) as string[];
    expect(files.every((k) => existsSync(resolveKey(k)))).toBe(true);
    await closeViewOnce(db, conv, allan.id, message.id);
    expect(files.some((k) => existsSync(resolveKey(k)))).toBe(false);
    expect(await db.select().from(attachments).where(eq(attachments.id, att.id))).toEqual([]);
    const [row] = await db.select().from(messages).where(eq(messages.id, message.id));
    expect(row).toMatchObject({ body: null, attachmentId: null });
    expect(row!.contentDeletedAt).not.toBeNull();
  });

  it("aberta e esquecida (aba fechada): a varredura apaga depois do tempo de graça", async () => {
    const { maria, allan, conv } = await people();
    const { message, att } = await sendPhoto(conv, maria.id, { viewOnce: true });
    await openViewOnce(db, conv, allan.id, message.id);
    expect(await sweepViewOnce(db)).toBe(0);
    expect(await sweepViewOnce(db, new Date(Date.now() + VIEW_ONCE_GRACE_MS + 1000))).toBe(1);
    expect(existsSync(resolveKey(att.storageKey))).toBe(false);
  });
});

describe("limpeza de mídias", () => {
  it("prévia conta sem apagar; limpeza apaga só as antigas dos tipos escolhidos", async () => {
    const { maria, conv } = await people();
    const old = await sendPhoto(conv, maria.id);
    const recent = await sendPhoto(conv, maria.id);
    await db
      .update(messages)
      .set({ createdAt: new Date(Date.now() - 40 * 86_400_000) })
      .where(eq(messages.id, old.message.id));
    const text = await createTextMessage(db, conv, maria.id, {
      clientId: crypto.randomUUID(),
      body: "texto antigo fica",
    });
    await db
      .update(messages)
      .set({ createdAt: new Date(Date.now() - 40 * 86_400_000) })
      .where(eq(messages.id, text.message.id));

    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    expect(await purgePreview(db, { before: cutoff, kinds: ["VIDEO"] })).toEqual({
      count: 0,
      bytes: 0,
    });
    const p = await purgePreview(db, { before: cutoff, kinds: ["IMAGE"] });
    expect(p.count).toBe(1);
    expect(p.bytes).toBe(old.att.sizeBytes);
    expect(existsSync(resolveKey(old.att.storageKey))).toBe(true); // prévia não apaga

    expect(await purgeMedia(db, { before: cutoff, kinds: ["IMAGE"] })).toEqual(p);
    expect(existsSync(resolveKey(old.att.storageKey))).toBe(false);
    expect(existsSync(resolveKey(recent.att.storageKey))).toBe(true);

    const list = await listMessages(db, conv, maria.id);
    expect(list.messages.find((m) => m.id === old.message.id)).toMatchObject({
      expired: true,
      viewOnce: false,
      attachment: null,
    });
    expect(list.messages.find((m) => m.id === text.message.id)?.body).toBe("texto antigo fica");
  });

  it("automática pela idade do painel; 'nunca' não apaga nada", async () => {
    const { maria, conv } = await people();
    const old = await sendPhoto(conv, maria.id);
    await db
      .update(messages)
      .set({ createdAt: new Date(Date.now() - 100 * 86_400_000) })
      .where(eq(messages.id, old.message.id));
    expect(await purgeByRetention(db)).toBe(0); // padrão: nunca
    await updateSettings(db, {
      autoLockMinutes: 5,
      lockOnTabLeave: true,
      lockOnReopen: true,
      mediaRetentionDays: 180,
    });
    expect(await purgeByRetention(db)).toBe(0);
    await updateSettings(db, {
      autoLockMinutes: 5,
      lockOnTabLeave: true,
      lockOnReopen: true,
      mediaRetentionDays: 90,
    });
    expect(await purgeByRetention(db)).toBe(1);
    expect(existsSync(resolveKey(old.att.storageKey))).toBe(false);
  });

  it("estatísticas: só números por tipo e por mês, sem nomes", async () => {
    const { maria, conv } = await people();
    const a = await sendPhoto(conv, maria.id);
    const s = await mediaStats(db);
    expect(s.byKind.IMAGE).toEqual({ count: 1, bytes: a.att.sizeBytes });
    expect(s.total.count).toBe(1);
    expect(s.byMonth).toHaveLength(1);
    expect(s.byMonth[0]!.month).toMatch(/^\d{4}-\d{2}$/);
    expect(JSON.stringify(s)).not.toContain("praia");
  });
});
