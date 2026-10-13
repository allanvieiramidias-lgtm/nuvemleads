import { db } from "@/db";
import type { Conversation } from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, forbiddenOrigin, handleError, isSameOrigin } from "@/lib/http";
import { getActiveConversation } from "@/server/conversations";
import type { SessionInfo } from "@/server/participant-auth";

type Ctx = { session: SessionInfo; conv: Conversation };

/**
 * Rotas de conteúdo da conversa: exigem sessão válida e DESBLOQUEADA (423 se bloqueada)
 * e que a pessoa faça parte da conversa do par ativo (ARQUITETURA §7).
 */
export function chatRoute(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method !== "GET" && !isSameOrigin(req)) return forbiddenOrigin();
    try {
      const session = await getCurrentSession();
      if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
      if (session.locked) return apiError("LOCKED", "Sessão bloqueada.");
      const conv = await getActiveConversation(db);
      if (!conv || (conv.userAId !== session.user.id && conv.userBId !== session.user.id)) {
        return apiError("NOT_FOUND", "A conversa ainda não está disponível.");
      }
      return await handler(req, { session, conv });
    } catch (err) {
      return handleError(err);
    }
  };
}
