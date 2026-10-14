import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { apiError, json } from "@/lib/http";
import { closeViewOnce } from "@/server/media-lifecycle";

const idOf = (req: Request) => new URL(req.url).pathname.split("/").at(-2) ?? "";

/** POST → fechou o visor: a mídia aberta é apagada do servidor na hora (DECISOES §30). */
export const POST = chatRoute(async (req, { session, conv }) => {
  const id = idOf(req);
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError("NOT_FOUND", "Mensagem não encontrada.");
  await closeViewOnce(db, conv, session.user.id, id);
  return json({ ok: true });
});
