import { db } from "@/db";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, forbiddenOrigin, handleError, isSameOrigin, json } from "@/lib/http";
import { bootSession } from "@/server/participant-auth";

/**
 * Chamado uma única vez por carregamento completo de /chat (DECISOES §7):
 * o primeiro depois do PIN entra; recarregar/reabrir começa bloqueado.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const session = await getCurrentSession();
    if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
    const booted = await bootSession(db, session);
    return json({
      locked: booted.locked,
      lockReason: booted.lockReason,
      lockedAt: booted.lockedAt?.toISOString() ?? null,
      slug: booted.user.slug,
    });
  } catch (err) {
    return handleError(err);
  }
}
