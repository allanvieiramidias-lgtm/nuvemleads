import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { getActiveConversation } from "@/server/conversations";
import { DomainError } from "@/server/errors";
import { on } from "@/server/events";
import { createTextMessage, listMessages, markDelivered, markRead } from "@/server/messages";
import { createUser } from "@/server/users";
import { resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
  const allan = await createUser(db, { name: "Allan Souza", pin: "905317", status: "ACTIVE" });
  const conv = (await getActiveConversation(db))!;
  return { maria, allan, conv };
}

const send = (
  conv: Awaited<ReturnType<typeof setup>>["conv"],
  senderId: string,
  body: string,
  clientId = crypto.randomUUID(),
) => createTextMessage(db, conv, senderId, { clientId, body });

describe("enviar texto", () => {
  it("cria, avisa message:new e é idempotente pelo clientId", async () => {
    const { maria, conv } = await setup();
    const seen: string[] = [];
    const off = on("message:new", (e) => seen.push(e.message.body ?? ""));
    const clientId = crypto.randomUUID();
    const a = await send(conv, maria.id, "Oi\nAllan", clientId);
    const b = await send(conv, maria.id, "Oi\nAllan", clientId); // reenvio da fila offline
    off();
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.message.id).toBe(a.message.id);
    expect(a.message).toMatchObject({
      kind: "TEXT",
      body: "Oi\nAllan",
      status: "sent",
      senderId: maria.id,
    });
    expect(seen).toEqual(["Oi\nAllan"]); // só um aviso
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("recusa vazio e acima de 4000 caracteres", async () => {
    const { maria, conv } = await setup();
    await expect(send(conv, maria.id, "   \n ")).rejects.toBeInstanceOf(DomainError);
    await expect(send(conv, maria.id, "x".repeat(4001))).rejects.toBeInstanceOf(DomainError);
    await expect(send(conv, maria.id, "x".repeat(4000))).resolves.toBeTruthy();
  });
});

describe("listar com paginação reversa", () => {
  it("devolve páginas em ordem cronológica e o cursor anda para trás", async () => {
    const { maria, allan, conv } = await setup();
    const base = Date.now() - 100_000;
    for (let i = 0; i < 7; i++) {
      await db.insert(messages).values({
        conversationId: conv.id,
        clientId: crypto.randomUUID(),
        senderId: i % 2 ? allan.id : maria.id,
        kind: "TEXT",
        body: `m${i}`,
        createdAt: new Date(base + i * 1000),
      });
    }
    const p1 = await listMessages(db, conv, maria.id, { limit: 3 });
    expect(p1.messages.map((m) => m.body)).toEqual(["m4", "m5", "m6"]);
    const p2 = await listMessages(db, conv, maria.id, { limit: 3, cursor: p1.nextCursor });
    expect(p2.messages.map((m) => m.body)).toEqual(["m1", "m2", "m3"]);
    const p3 = await listMessages(db, conv, maria.id, { limit: 3, cursor: p2.nextCursor });
    expect(p3.messages.map((m) => m.body)).toEqual(["m0"]);
    expect(p3.nextCursor).toBeNull();
  });

  it("mensagens no mesmo instante não se perdem entre páginas", async () => {
    const { maria, conv } = await setup();
    const at = new Date();
    for (let i = 0; i < 5; i++) {
      await db
        .insert(messages)
        .values({
          conversationId: conv.id,
          clientId: crypto.randomUUID(),
          senderId: maria.id,
          kind: "TEXT",
          body: `s${i}`,
          createdAt: at,
        });
    }
    const p1 = await listMessages(db, conv, maria.id, { limit: 2 });
    const p2 = await listMessages(db, conv, maria.id, { limit: 2, cursor: p1.nextCursor });
    const p3 = await listMessages(db, conv, maria.id, { limit: 2, cursor: p2.nextCursor });
    const all = [...p3.messages, ...p2.messages, ...p1.messages].map((m) => m.body).sort();
    expect(all).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });

  it("ao listar, as mensagens da outra pessoa viram entregues (DECISOES §11); as próprias não", async () => {
    const { maria, allan, conv } = await setup();
    const fromMaria = await send(conv, maria.id, "oi");
    const fromAllan = await send(conv, allan.id, "olá");
    const statuses: string[] = [];
    const off = on("message:status", (e) =>
      statuses.push(`${e.id === fromMaria.message.id ? "maria" : "allan"}:${e.status}`),
    );
    const page = await listMessages(db, conv, allan.id);
    off();
    expect(page.messages.find((m) => m.id === fromMaria.message.id)?.status).toBe("delivered");
    expect(page.messages.find((m) => m.id === fromAllan.message.id)?.status).toBe("sent");
    expect(statuses).toEqual(["maria:delivered"]);
  });
});

describe("entregue e lida", () => {
  it("lida vale até a mensagem indicada e também marca entregue; ninguém marca as próprias", async () => {
    const { maria, allan, conv } = await setup();
    const m1 = await send(conv, maria.id, "1");
    await new Promise((r) => setTimeout(r, 5));
    const m2 = await send(conv, maria.id, "2");
    await new Promise((r) => setTimeout(r, 5));
    const m3 = await send(conv, maria.id, "3");

    expect(await markRead(db, conv, maria.id, m3.message.id)).toBe(0); // as próprias
    expect(await markRead(db, conv, allan.id, m2.message.id)).toBe(2);
    const rows = await db.select().from(messages);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[m1.message.id]!.readAt).not.toBeNull();
    expect(byId[m2.message.id]!.deliveredAt).not.toBeNull();
    expect(byId[m3.message.id]!.readAt).toBeNull();

    await markDelivered(db, conv, maria.id, [m3.message.id]); // a remetente não "entrega" para si
    const [m3row] = await db.select().from(messages).where(eq(messages.id, m3.message.id));
    expect(m3row!.deliveredAt).toBeNull();
  });
});
