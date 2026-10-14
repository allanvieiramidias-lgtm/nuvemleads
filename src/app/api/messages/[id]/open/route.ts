import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { apiError, json } from "@/lib/http";
import { openViewOnce } from "@/server/media-lifecycle";

const idOf = (req: Request) => new URL(req.url).pathname.split("/").at(-2) ?? "";

/**
 * POST → abre a visualização única (DECISOES §30): { body, attachment } uma única vez.
 * 410 GONE se já foi aberta. Só quem recebeu.
 */
export const POST = chatRoute(async (req, { session, conv }) => {
  const id = idOf(req);
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError("NOT_FOUND", "Mensagem não encontrada.");
  return json(await openViewOnce(db, conv, session.user.id, id));
});
