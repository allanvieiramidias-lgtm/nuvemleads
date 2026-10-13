import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { userSessions } from "@/db/schema";
import { verifySecret } from "@/lib/auth/hash";
import { users } from "@/db/schema";
import { DomainError } from "./errors";
import { emit } from "./events";
import { PIN_INVALID, PIN_TOO_MANY } from "./participant-auth";
import { pinRetryAfter, registerPinFailure, registerPinSuccess } from "./pin-limits";
import { getSettings } from "./settings";

export type LockReasonCode = "TAB" | "BLUR" | "IDLE" | "MANUAL" | "REOPEN";

/** Bloqueia a sessão no servidor (rotas passam a responder 423; o socket é desconectado). */
export async function lockSession(db: Db, sessionId: string, reason: LockReasonCode) {
  const lockedAt = new Date();
  const [row] = await db
    .update(userSessions)
    .set({ locked: true, lockReason: reason, lockedAt })
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.locked, false)))
    .returning({ id: userSessions.id });
  if (row) emit("session:locked", { sessionId, reason });
  return lockedAt;
}

/**
 * Desbloqueia com o PIN (README §4.4). Mesmos limites de tentativa do login (DECISOES §8).
 * PIN trocado ou pessoa desativada → REVOKED (volta para a tela de PIN do link).
 */
export async function unlockSession(db: Db, sessionId: string, input: { pin: string; ip: string }) {
  const [row] = await db
    .select({ s: userSessions, u: users })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(eq(userSessions.id, sessionId));
  if (
    !row ||
    row.u.status !== "ACTIVE" ||
    row.s.pinVersion !== row.u.pinVersion ||
    row.s.expiresAt <= new Date()
  ) {
    throw new DomainError("REVOKED", "Sessão encerrada. Digite seu PIN.");
  }
  const wait = await pinRetryAfter(db, row.u.id, input.ip);
  if (wait > 0) throw new DomainError("TOO_MANY", PIN_TOO_MANY, { retryAfter: String(wait) });

  if (!/^\d{6}$/.test(input.pin) || !(await verifySecret(row.u.pinHash, input.pin))) {
    const { retryAfter, attemptsLeft } = await registerPinFailure(db, row.u.id, input.ip);
    if (retryAfter > 0)
      throw new DomainError("TOO_MANY", PIN_TOO_MANY, { retryAfter: String(retryAfter) });
    throw new DomainError("INVALID_PIN", PIN_INVALID, { attemptsLeft: String(attemptsLeft) });
  }
  await registerPinSuccess(db, row.u.id, input.ip);
  await db
    .update(userSessions)
    .set({ locked: false, lockReason: null, lockedAt: null, lastSeenAt: new Date() })
    .where(eq(userSessions.id, sessionId));
}

/**
 * Batimento a cada 30 s (ARQUITETURA §5). Com atividade real, renova `lastSeenAt`;
 * sem atividade além do tempo configurado, o próprio servidor bloqueia (IDLE) —
 * vale mesmo que o navegador tenha sido adulterado.
 */
export async function heartbeat(
  db: Db,
  sessionId: string,
  active: boolean,
): Promise<{ locked: boolean; reason: LockReasonCode | null }> {
  const [s] = await db.select().from(userSessions).where(eq(userSessions.id, sessionId));
  if (!s) throw new DomainError("REVOKED", "Sessão encerrada. Digite seu PIN.");
  if (s.locked) return { locked: true, reason: s.lockReason };
  const now = new Date();
  if (active) {
    await db.update(userSessions).set({ lastSeenAt: now }).where(eq(userSessions.id, sessionId));
    return { locked: false, reason: null };
  }
  const { autoLockMinutes } = await getSettings(db);
  if (now.getTime() - s.lastSeenAt.getTime() > autoLockMinutes * 60_000) {
    await lockSession(db, sessionId, "IDLE");
    return { locked: true, reason: "IDLE" };
  }
  return { locked: false, reason: null };
}

/**
 * Varredura do servidor: bloqueia sessões abertas sem atividade além do tempo
 * configurado (cobre abas que pararam de mandar batimento). Margem de 1 batimento.
 */
export async function lockIdleSessions(db: Db, now = new Date()): Promise<number> {
  const { autoLockMinutes } = await getSettings(db);
  const limit = new Date(now.getTime() - autoLockMinutes * 60_000 - 30_000);
  const rows = await db
    .update(userSessions)
    .set({ locked: true, lockReason: "IDLE", lockedAt: now })
    .where(and(eq(userSessions.locked, false), lt(userSessions.lastSeenAt, limit)))
    .returning({ id: userSessions.id });
  for (const r of rows) emit("session:locked", { sessionId: r.id, reason: "IDLE" });
  return rows.length;
}
