import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { json } from "@/lib/http";
import { clearForMe } from "@/server/hide";

/** POST → "Limpar conversa" só para esta pessoa (DECISOES §31). */
export const POST = chatRoute(async (_req, { session, conv }) => {
  await clearForMe(db, conv, session.user.id);
  return json({ ok: true });
});
