import { db } from "@/db";
import type { Attachment } from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, handleError } from "@/lib/http";
import { getAccessibleAttachment } from "@/server/media-access";

/** Rotas de mídia: sessão válida e desbloqueada (423) de um dos participantes. */
export function mediaRoute(handler: (req: Request, att: Attachment) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const session = await getCurrentSession();
      if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
      if (session.locked) return apiError("LOCKED", "Sessão bloqueada.");
      const att = await getAccessibleAttachment(db, (await params).id, session.user.id);
      if (!att) return apiError("NOT_FOUND", "Arquivo não encontrado.");
      return await handler(req, att);
    } catch (err) {
      return handleError(err);
    }
  };
}
