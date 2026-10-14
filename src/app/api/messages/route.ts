import { z } from "zod";
import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { json, readJson } from "@/lib/http";
import {
  AttachmentMessageSchema,
  createAttachmentMessage,
  createTextMessage,
  listMessages,
} from "@/server/messages";

/** GET ?cursor=&limit=50 — paginação reversa. 423 com sessão bloqueada. */
export const GET = chatRoute(async (req, { session, conv }) => {
  const url = new URL(req.url);
  const result = await listMessages(db, conv, session.user.id, {
    cursor: url.searchParams.get("cursor"),
    limit: Number(url.searchParams.get("limit") ?? 50) || 50,
  });
  return json(result);
});

const TextBody = z.object({
  clientId: z.string().uuid(),
  kind: z.literal("TEXT"),
  body: z.string(),
  viewOnce: z.boolean().optional(),
});
const Body = z.union([TextBody, AttachmentMessageSchema]);

/**
 * POST { clientId, kind: 'TEXT', body } ou { clientId, kind, attachmentId, caption? }.
 * Idempotente por clientId. A resposta é o "ack".
 */
export const POST = chatRoute(async (req, { session, conv }) => {
  const input = await readJson(req, Body);
  const { message, created } =
    input.kind === "TEXT"
      ? await createTextMessage(db, conv, session.user.id, input)
      : await createAttachmentMessage(db, conv, session.user.id, input);
  return json({ message }, { status: created ? 201 : 200 });
});
