import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { userSessions } from "@/db/schema";
import { DomainError } from "@/server/errors";
import { on } from "@/server/events";
import { getSessionByToken, loginWithPin } from "@/server/participant-auth";
import { heartbeat, lockIdleSessions, lockSession, unlockSession } from "@/server/session-lock";
import { updateSettings } from "@/server/settings";
import { changeUserPin, createUser } from "@/server/users";
import { resetDb } from "./helpers";

beforeEach(resetDb);

async function session() {
  const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
  const { token } = await loginWithPin(db, { slug: maria.slug, pin: "246810", ip: "1" });
  const s = (await getSessionByToken(db, token))!;
  return { maria, token, sessionId: s.sessionId };
}
async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return e as DomainError;
}
const ago = (ms: number) => new Date(Date.now() - ms);

describe("bloquear e desbloquear", () => {
  it("bloqueia com motivo e avisa; desbloquear com PIN certo libera", async () => {
    const { token, sessionId } = await session();
    const events: string[] = [];
    const off = on("session:locked", (e) => events.push(e.reason));
    await lockSession(db, sessionId, "TAB");
    await lockSession(db, sessionId, "BLUR"); // já bloqueada: não troca o motivo nem avisa de novo
    off();
    expect(events).toEqual(["TAB"]);
    expect(await getSessionByToken(db, token)).toMatchObject({ locked: true, lockReason: "TAB" });

    expect((await errorOf(unlockSession(db, sessionId, { pin: "111111", ip: "1" }))).code).toBe(
      "INVALID_PIN",
    );
    await unlockSession(db, sessionId, { pin: "246810", ip: "1" });
    expect(await getSessionByToken(db, token)).toMatchObject({ locked: false, lockReason: null });
  });

  it("3 erros no desbloqueio → espera de 15 s (mesmo limite do login)", async () => {
    const { sessionId } = await session();
    await lockSession(db, sessionId, "MANUAL");
    await errorOf(unlockSession(db, sessionId, { pin: "111111", ip: "9" }));
    await errorOf(unlockSession(db, sessionId, { pin: "222222", ip: "9" }));
    const e = await errorOf(unlockSession(db, sessionId, { pin: "333333", ip: "9" }));
    expect(e.code).toBe("TOO_MANY");
    expect((await errorOf(unlockSession(db, sessionId, { pin: "246810", ip: "9" }))).code).toBe(
      "TOO_MANY",
    );
  });

  it("PIN trocado pelo admin: desbloqueio volta para o link (REVOKED)", async () => {
    const { maria, sessionId } = await session();
    await lockSession(db, sessionId, "MANUAL");
    await changeUserPin(db, maria.id, "905317"); // apaga as sessões
    expect((await errorOf(unlockSession(db, sessionId, { pin: "905317", ip: "1" }))).code).toBe(
      "REVOKED",
    );
  });
});

describe("inatividade (o servidor decide)", () => {
  it("batimento ativo renova; parado além do tempo bloqueia IDLE", async () => {
    await updateSettings(db, { autoLockMinutes: 1, lockOnTabLeave: true, lockOnReopen: true });
    const { sessionId } = await session();
    expect(await heartbeat(db, sessionId, true)).toEqual({ locked: false, reason: null });
    await db
      .update(userSessions)
      .set({ lastSeenAt: ago(30_000) })
      .where(eq(userSessions.id, sessionId));
    expect((await heartbeat(db, sessionId, false)).locked).toBe(false); // 30 s < 1 min
    await db
      .update(userSessions)
      .set({ lastSeenAt: ago(70_000) })
      .where(eq(userSessions.id, sessionId));
    expect(await heartbeat(db, sessionId, false)).toEqual({ locked: true, reason: "IDLE" });
    expect(await heartbeat(db, sessionId, true)).toEqual({ locked: true, reason: "IDLE" }); // atividade depois não destrava
  });

  it("varredura bloqueia sessões sem batimento, mesmo com o navegador adulterado", async () => {
    const { sessionId } = await session();
    await db
      .update(userSessions)
      .set({ lastSeenAt: ago(5 * 60_000 + 10_000) })
      .where(eq(userSessions.id, sessionId));
    expect(await lockIdleSessions(db)).toBe(0); // dentro da margem de 1 batimento
    await db
      .update(userSessions)
      .set({ lastSeenAt: ago(6 * 60_000) })
      .where(eq(userSessions.id, sessionId));
    const events: string[] = [];
    const off = on("session:locked", (e) => events.push(e.sessionId));
    expect(await lockIdleSessions(db)).toBe(1);
    off();
    expect(events).toEqual([sessionId]);
    const [s] = await db.select().from(userSessions).where(eq(userSessions.id, sessionId));
    expect(s).toMatchObject({ locked: true, lockReason: "IDLE" });
  });
});
