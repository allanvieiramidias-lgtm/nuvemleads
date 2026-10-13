import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { userSessions } from "@/db/schema";
import { emit } from "./events";

export type LockReasonCode = "TAB" | "BLUR" | "IDLE" | "MANUAL" | "REOPEN";

/** Bloqueia a sessão no servidor (rotas passam a responder 423; o socket é desconectado). */
export async function lockSession(db: Db, sessionId: string, reason: LockReasonCode) {
  const lockedAt = new Date();
  const [row] = await db
    .update(userSessions)
    .set({ locked: true, lockReason: reason, lockedAt })
    .where(eq(userSessions.id, sessionId))
    .returning({ id: userSessions.id });
  if (row) emit("session:locked", { sessionId, reason });
  return lockedAt;
}
