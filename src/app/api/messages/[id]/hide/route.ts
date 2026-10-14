import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { apiError, json } from "@/lib/http";
import { hideForMe } from "@/server/hide";

const idOf = (req: Request) => new URL(req.url).pathname.split("/").at(-2) ?? "";

/** POST → "Apagar para mim" (DECISOES §31). A outra pessoa continua vendo. */
export const POST = chatRoute(async (req, { session, conv }) => {
  const id = idOf(req);
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError("NOT_FOUND", "Mensagem não encontrada.");
  await hideForMe(db, conv, session.user.id, id);
  return json({ ok: true });
});
