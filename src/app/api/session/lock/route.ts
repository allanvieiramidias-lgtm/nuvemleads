import { z } from "zod";
import { db } from "@/db";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, forbiddenOrigin, handleError, isSameOrigin, json } from "@/lib/http";
import { lockSession } from "@/server/session-lock";

const Body = z.object({
  reason: z.enum(["TAB", "BLUR", "IDLE", "MANUAL", "REOPEN"]).default("MANUAL"),
});

/** POST { reason } — aceita sendBeacon (corpo como texto). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const session = await getCurrentSession();
    if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
    const raw = await req.text().catch(() => "");
    let parsed: unknown = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    const { reason } = Body.parse(parsed);
    const lockedAt = session.locked
      ? session.lockedAt
      : await lockSession(db, session.sessionId, reason);
    return json({ locked: true, lockedAt: lockedAt?.toISOString() ?? null });
  } catch (err) {
    return handleError(err);
  }
}
