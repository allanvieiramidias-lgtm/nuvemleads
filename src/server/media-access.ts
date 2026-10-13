import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { attachments, conversations, messages, type Attachment } from "@/db/schema";

/**
 * Quem pode ver um anexo: participante desbloqueado da conversa da mensagem,
 * ou quem enviou (antes de a mensagem existir). O admin nunca (ARQUITETURA §7).
 */
export async function getAccessibleAttachment(
  db: Db,
  attachmentId: string,
  userId: string,
): Promise<Attachment | null> {
  if (!/^[0-9a-f-]{36}$/.test(attachmentId)) return null;
  const [att] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!att) return null;
  const [row] = await db
    .select({ a: conversations.userAId, b: conversations.userBId })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(eq(messages.attachmentId, attachmentId));
  if (row) return row.a === userId || row.b === userId ? att : null;
  return att.uploaderId === userId ? att : null;
}
