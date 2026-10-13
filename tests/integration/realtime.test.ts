import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { getActiveConversation } from "@/server/conversations";
import { createTextMessage } from "@/server/messages";
import { loginWithPin } from "@/server/participant-auth";
import { attachRealtime } from "@/server/realtime";
import { lockSession } from "@/server/session-lock";
import { changeUserPin, createUser } from "@/server/users";
import { getSessionByToken } from "@/server/participant-auth";
import { resetDb } from "./helpers";

let http: HttpServer;
let url: string;
const opened: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  attachRealtime(new Server(http, { path: "/socket.io" }));
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(() => {
  opened.forEach((s) => s.disconnect());
  http.close();
});
beforeEach(async () => {
  opened.forEach((s) => s.disconnect());
  opened.length = 0;
  await resetDb();
});

function client(token: string | null, origin = url) {
  const s = connect(url, {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { origin, ...(token ? { cookie: `nl_user=${token}` } : {}) },
  });
  opened.push(s);
  return s;
}
const connected = (s: Socket) =>
  new Promise<void>((ok, fail) => {
    s.once("connect", () => ok());
    s.once("connect_error", (e) => fail(e));
  });
const rejected = (s: Socket) =>
  new Promise<string>((ok) => s.once("connect_error", (e) => ok(e.message)));
const next = <T>(s: Socket, ev: string) => new Promise<T>((ok) => s.once(ev, ok));

async function pair() {
  const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
  const allan = await createUser(db, { name: "Allan Souza", pin: "905317", status: "ACTIVE" });
  const m = await loginWithPin(db, { slug: maria.slug, pin: "246810", ip: "1" });
  const a = await loginWithPin(db, { slug: allan.slug, pin: "905317", ip: "2" });
  return { maria, allan, mToken: m.token, aToken: a.token };
}

describe("handshake", () => {
  it("recusa sem sessão, com outra origem e com sessão bloqueada", async () => {
    const { mToken } = await pair();
    expect(await rejected(client(null))).toBe("REVOKED");
    expect(await rejected(client(mToken, "https://malicioso.example"))).toBe("FORBIDDEN");
    const s = (await getSessionByToken(db, mToken))!;
    await lockSession(db, s.sessionId, "MANUAL");
    expect(await rejected(client(mToken))).toBe("LOCKED");
  });
});

describe("eventos", () => {
  it("presença, digitando, mensagem nova e entregue", async () => {
    const { maria, allan, mToken, aToken } = await pair();
    const m = client(mToken);
    await connected(m);
    const a = client(aToken);
    const mariaSeesAllanOnline = new Promise<{ userId: string; online: boolean }>((ok) =>
      m.on(
        "presence",
        (p: { userId: string; online: boolean }) => p.userId === allan.id && p.online && ok(p),
      ),
    );
    await connected(a);
    expect((await mariaSeesAllanOnline).online).toBe(true);

    const typing = next<{ on: boolean }>(a, "typing");
    m.emit("typing", { on: true });
    expect((await typing).on).toBe(true);

    const conv = (await getActiveConversation(db))!;
    const incoming = next<{ body: string; id: string }>(a, "message:new");
    const { message } = await createTextMessage(db, conv, maria.id, {
      clientId: crypto.randomUUID(),
      body: "oi",
    });
    expect((await incoming).body).toBe("oi");

    const status = next<{ id: string; status: string }>(m, "message:status");
    a.emit("message:delivered", { id: message.id });
    expect(await status).toEqual({ id: message.id, status: "delivered" });

    const offline = new Promise<{ online: boolean; lastSeenAt: string | null }>((ok) =>
      m.on(
        "presence",
        (p: { userId: string; online: boolean; lastSeenAt: string | null }) =>
          p.userId === allan.id && !p.online && ok(p),
      ),
    );
    a.disconnect();
    const p = await offline;
    expect(p.lastSeenAt).not.toBeNull();
  });

  it("trocar o PIN expulsa a pessoa na hora (session:revoked)", async () => {
    const { maria, mToken } = await pair();
    const m = client(mToken);
    await connected(m);
    const revoked = next(m, "session:revoked");
    const gone = next(m, "disconnect");
    await changeUserPin(db, maria.id, "135792");
    await revoked;
    await gone;
  });

  it("bloquear no servidor avisa e desconecta só aquela sessão", async () => {
    const { mToken, aToken } = await pair();
    const m = client(mToken);
    const a = client(aToken);
    await Promise.all([connected(m), connected(a)]);
    const locked = next<{ reason: string }>(m, "session:locked");
    const s = (await getSessionByToken(db, mToken))!;
    await lockSession(db, s.sessionId, "IDLE");
    expect((await locked).reason).toBe("IDLE");
    await new Promise((r) => setTimeout(r, 100));
    expect(m.connected).toBe(false);
    expect(a.connected).toBe(true);
  });
});
