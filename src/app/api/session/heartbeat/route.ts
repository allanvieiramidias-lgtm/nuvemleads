import { z } from "zod";
import { db } from "@/db";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, forbiddenOrigin, handleError, isSameOrigin, json, readJson } from "@/lib/http";
import { heartbeat } from "@/server/session-lock";

const Body = z.object({ active: z.boolean() });

/** POST { active } a cada 30 s. 423 se a sessão está (ou acabou de ficar) bloqueada. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const session = await getCurrentSession();
    if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
    const { active } = await readJson(req, Body);
    const r = await heartbeat(db, session.sessionId, active);
    return r.locked
      ? apiError("LOCKED", "Sessão bloqueada.", { reason: r.reason ?? "IDLE" })
      : json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
