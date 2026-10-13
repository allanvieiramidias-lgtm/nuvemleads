import { z } from "zod";
import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { json, readJson } from "@/lib/http";
import { markRead } from "@/server/messages";

const Body = z.object({ upToId: z.string().uuid() });

/** Só aceito com sessão desbloqueada; o cliente só chama com a aba visível. */
export const POST = chatRoute(async (req, { session, conv }) => {
  const { upToId } = await readJson(req, Body);
  return json({ updated: await markRead(db, conv, session.user.id, upToId) });
});
