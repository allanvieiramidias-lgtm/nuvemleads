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
import { clearForMe, hideForMe } from "@/server/hide";
import { createAttachmentMessage, createTextMessage, listMessages } from "@/server/messages";
import { getUnreadNotice } from "@/server/notice";
import { receiveUpload, storeUpload } from "@/server/uploads";
import { createUser } from "@/server/users";
import { resetDb } from "./helpers";

// DECISOES §31: "Apagar para mim" e "Limpar conversa". Só some para quem pediu; quando as
// duas pessoas já não veem, o conteúdo sai do servidor de verdade.
beforeEach(resetDb);

async function people() {
  const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
  const allan = await createUser(db, { name: "Allan Souza", pin: "905317", status: "ACTIVE" });
  return { maria, allan, conv: (await getActiveConversation(db))! };
}
type Ctx = Awaited<ReturnType<typeof people>>;

const text = (c: Ctx, from: string, body: string) =>
  createTextMessage(db, c.conv, from, { clientId: crypto.randomUUID(), body }).then(
    (r) => r.message,
  );

async function photo(c: Ctx, from: string) {
  const bytes = await sharp({
    create: { width: 400, height: 300, channels: 3, background: "#305080" },
  })
    .jpeg()
    .toBuffer();
  const fd = new FormData();
  fd.append("kind", "media");
  fd.append("file", new Blob([new Uint8Array(bytes)]), "foto.jpg");
  const up = await storeUpload(
    db,
    from,
    await receiveUpload(new Request("http://x/api/uploads", { method: "POST", body: fd })),
  );
  const { message } = await createAttachmentMessage(db, c.conv, from, {
    clientId: crypto.randomUUID(),
    kind: "IMAGE",
    attachmentId: up.attachmentId,
  });
  const [att] = await db.select().from(attachments).where(eq(attachments.id, up.attachmentId));
  return { message, att: att! };
}

const ids = async (c: Ctx, viewer: string) =>
  (await listMessages(db, c.conv, viewer)).messages.map((m) => m.id);

describe("apagar para mim", () => {
  it("some só para quem apagou; a outra pessoa continua vendo o conteúdo", async () => {
    const c = await people();
    const a = await text(c, c.maria.id, "primeira");
    const b = await text(c, c.allan.id, "segunda");

    await hideForMe(db, c.conv, c.maria.id, a.id);
    expect(await ids(c, c.maria.id)).toEqual([b.id]);
    const allanList = (await listMessages(db, c.conv, c.allan.id)).messages;
    expect(allanList.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(allanList[0]!.body).toBe("primeira");

    // repetir não dá erro; mensagem de outra conversa/inexistente dá
    await hideForMe(db, c.conv, c.maria.id, a.id);
    const err = await hideForMe(db, c.conv, c.maria.id, crypto.randomUUID()).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("NOT_FOUND");
  });

  it("apagar uma recebida e não lida conta como lida (o aviso some)", async () => {
    const c = await people();
    const m = await text(c, c.allan.id, "oi");
    expect((await getUnreadNotice(db, c.maria.id)).unread).toBe(true);
    const statuses: unknown[] = [];
    const off = on("message:status", (e) => statuses.push(e));
    await hideForMe(db, c.conv, c.maria.id, m.id);
    off();
    expect((await getUnreadNotice(db, c.maria.id)).unread).toBe(false);
    expect(statuses).toEqual([expect.objectContaining({ id: m.id, status: "read" })]);
  });

  it("quando as duas apagam, o texto e a foto saem do banco e do disco", async () => {
    const c = await people();
    const t = await text(c, c.maria.id, "vai sumir");
    const { message: p, att } = await photo(c, c.allan.id);
    const files = [att.storageKey, att.thumbKey].filter(Boolean) as string[];

    await hideForMe(db, c.conv, c.maria.id, t.id);
    await hideForMe(db, c.conv, c.maria.id, p.id);
    expect(files.every((k) => existsSync(resolveKey(k)))).toBe(true);
    const [kept] = await db.select().from(messages).where(eq(messages.id, t.id));
    expect(kept!.body).toBe("vai sumir");

    await hideForMe(db, c.conv, c.allan.id, t.id);
    await hideForMe(db, c.conv, c.allan.id, p.id);
    const [gone] = await db.select().from(messages).where(eq(messages.id, t.id));
    expect(gone!.body).toBeNull();
    expect(gone!.contentDeletedAt).not.toBeNull();
    expect(files.some((k) => existsSync(resolveKey(k)))).toBe(false);
    expect(await db.select().from(attachments).where(eq(attachments.id, att.id))).toEqual([]);
    expect(await ids(c, c.maria.id)).toEqual([]);
    expect(await ids(c, c.allan.id)).toEqual([]);
  });
});

describe("limpar conversa", () => {
  it("limpa tudo até agora só para quem pediu; as novas aparecem normalmente", async () => {
    const c = await people();
    const a = await text(c, c.maria.id, "antes 1");
    const b = await text(c, c.allan.id, "antes 2");
    await clearForMe(db, c.conv, c.maria.id);
    expect(await ids(c, c.maria.id)).toEqual([]);
    expect(await ids(c, c.allan.id)).toEqual([a.id, b.id]);
    expect((await getUnreadNotice(db, c.maria.id)).unread).toBe(false);

    await new Promise((r) => setTimeout(r, 5));
    const after = await text(c, c.allan.id, "depois");
    expect(await ids(c, c.maria.id)).toEqual([after.id]);
    expect((await getUnreadNotice(db, c.maria.id)).unread).toBe(true);
    const [row] = await db.select().from(messages).where(eq(messages.id, a.id));
    expect(row!.body).toBe("antes 1"); // Allan ainda vê
  });

  it("quando as duas limpam, o conteúdo anterior sai do servidor", async () => {
    const c = await people();
    const a = await text(c, c.maria.id, "segredo antigo");
    const { att } = await photo(c, c.maria.id);
    await clearForMe(db, c.conv, c.allan.id);
    // uma apagada antes por Maria e o resto pela limpeza dela
    await hideForMe(db, c.conv, c.maria.id, a.id);
    expect(existsSync(resolveKey(att.storageKey))).toBe(true);
    await clearForMe(db, c.conv, c.maria.id);
    const [row] = await db.select().from(messages).where(eq(messages.id, a.id));
    expect(row!.body).toBeNull();
    expect(existsSync(resolveKey(att.storageKey))).toBe(false);
  });
});
