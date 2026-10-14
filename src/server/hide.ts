import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { conversationClears, hiddenMessages, messages, type Conversation } from "@/db/schema";
import { DomainError } from "./errors";
import { emit } from "./events";
import { eraseMessageContent } from "./media-lifecycle";

/**
 * "Apagar para mim" e "Limpar conversa" (DECISOES §31). Só some do lado de quem pediu; a
 * outra pessoa continua vendo. Quando as duas já não veem uma mensagem, o conteúdo é
 * apagado de verdade do servidor (texto do banco, arquivos do disco).
 */

/** Recebida e ainda não lida: apagar conta como lida, para o aviso de novas mensagens sumir. */
async function markHiddenAsRead(db: Db, conv: Conversation, userId: string) {
  const now = new Date();
  const rows = await db
    .update(messages)
    .set({
      readAt: now,
      deliveredAt: sql`coalesce(${messages.deliveredAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(messages.conversationId, conv.id),
        ne(messages.senderId, userId),
        isNull(messages.readAt),
      ),
    )
    .returning({ id: messages.id, senderId: messages.senderId });
  for (const r of rows)
    emit("message:status", {
      conversationId: conv.id,
      senderId: r.senderId,
      id: r.id,
      status: "read",
    });
}

/** Apaga de verdade o que nenhuma das duas pessoas vê mais. */
export async function purgeInvisible(db: Db, conv: Conversation): Promise<number> {
  const seenBy = (u: string) =>
    sql`not exists (select 1 from ${hiddenMessages} h where h.message_id = ${messages.id} and h.user_id = ${u})
      and ${messages.createdAt} > coalesce((select c.cleared_at from ${conversationClears} c where c.user_id = ${u} and c.conversation_id = ${conv.id}), '-infinity'::timestamptz)`;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        isNull(messages.contentDeletedAt),
        sql`not (${seenBy(conv.userAId)})`,
        sql`not (${seenBy(conv.userBId)})`,
      ),
    );
  for (const r of rows) await eraseMessageContent(db, r.id);
  return rows.length;
}

export async function hideForMe(
  db: Db,
  conv: Conversation,
  userId: string,
  messageId: string,
): Promise<void> {
  const [m] = await db
    .select({ id: messages.id, senderId: messages.senderId, readAt: messages.readAt })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conv.id)));
  if (!m) throw new DomainError("NOT_FOUND", "Mensagem não encontrada.");
  await db.insert(hiddenMessages).values({ userId, messageId: m.id }).onConflictDoNothing();
  if (m.senderId !== userId && !m.readAt) {
    const now = new Date();
    await db
      .update(messages)
      .set({
        readAt: now,
        deliveredAt: sql`coalesce(${messages.deliveredAt}, ${now.toISOString()}::timestamptz)`,
      })
      .where(eq(messages.id, m.id));
    emit("message:status", {
      conversationId: conv.id,
      senderId: m.senderId,
      id: m.id,
      status: "read",
    });
  }
  await purgeInvisible(db, conv);
}

/** Limpa tudo o que existe até agora, só para esta pessoa. */
export async function clearForMe(db: Db, conv: Conversation, userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(conversationClears)
    .values({ userId, conversationId: conv.id, clearedAt: now })
    .onConflictDoUpdate({
      target: [conversationClears.userId, conversationClears.conversationId],
      set: { clearedAt: now },
    });
  await markHiddenAsRead(db, conv, userId);
  await purgeInvisible(db, conv);
}
