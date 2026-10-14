import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { attachments, conversations, messages, type Attachment } from "@/db/schema";

/** O que se pede do anexo: o arquivo, a miniatura ou o download. */
export type MediaPurpose = "file" | "thumb" | "download";

const VIEW_ONCE_GRACE_MS = 10 * 60_000; // = media-lifecycle (sem importar o módulo inteiro aqui)

/**
 * Quem pode ver um anexo: participante desbloqueado da conversa da mensagem,
 * ou quem enviou (antes de a mensagem existir). O admin nunca (ARQUITETURA §7).
 *
 * Visualização única (DECISOES §30): só quem recebeu, só depois de abrir e só por alguns
 * minutos. Sem miniatura e sem download (a não ser o próprio arquivo, quando é "Arquivo").
 * Nem quem enviou consegue ver de novo.
 */
export async function getAccessibleAttachment(
  db: Db,
  attachmentId: string,
  userId: string,
  purpose: MediaPurpose = "file",
  now = new Date(),
): Promise<Attachment | null> {
  if (!/^[0-9a-f-]{36}$/.test(attachmentId)) return null;
  const [att] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!att) return null;
  const [row] = await db
    .select({
      a: conversations.userAId,
      b: conversations.userBId,
      senderId: messages.senderId,
      viewOnce: messages.viewOnce,
      openedAt: messages.openedAt,
      deletedAt: messages.contentDeletedAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(eq(messages.attachmentId, attachmentId));
  if (!row) return att.uploaderId === userId ? att : null;
  if (row.a !== userId && row.b !== userId) return null;
  if (row.deletedAt) return null;
  if (row.viewOnce) {
    if (row.senderId === userId || !row.openedAt) return null;
    if (now.getTime() - row.openedAt.getTime() > VIEW_ONCE_GRACE_MS) return null;
    if (purpose === "thumb") return null;
    if (purpose === "download" && att.kind !== "FILE") return null;
  }
  return att;
}
