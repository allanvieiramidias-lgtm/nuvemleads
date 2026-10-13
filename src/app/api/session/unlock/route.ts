import { z } from "zod";
import { db } from "@/db";
import { getCurrentSession } from "@/lib/auth/user-session";
import {
  apiError,
  clientIp,
  forbiddenOrigin,
  handleError,
  isSameOrigin,
  json,
  readJson,
} from "@/lib/http";
import { unlockSession } from "@/server/session-lock";

const Body = z.object({ pin: z.string().max(12) });

/** POST { pin } → desbloqueia. Mesmos limites do login por PIN. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const session = await getCurrentSession();
    if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
    const { pin } = await readJson(req, Body);
    await unlockSession(db, session.sessionId, { pin, ip: clientIp(req) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
