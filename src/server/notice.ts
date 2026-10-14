import { and, eq, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { messages } from "@/db/schema";
import { getActiveConversation } from "./conversations";
import { visibleTo } from "./messages";
import { getSettings } from "./settings";

/**
 * "Você tem novas mensagens" (DECISOES §29): só sim ou não. Nunca quantas, de quem, quando
 * nem o quê. "Nova" = mensagem da outra pessoa que esta pessoa ainda não leu.
 */
export async function getUnreadNotice(
  db: Db,
  userId: string,
): Promise<{ enabled: boolean; unread: boolean }> {
  if (!(await getSettings(db)).unreadNotice) return { enabled: false, unread: false };
  const conv = await getActiveConversation(db);
  if (!conv || (conv.userAId !== userId && conv.userBId !== userId))
    return { enabled: true, unread: false };
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        ne(messages.senderId, userId),
        isNull(messages.readAt),
        visibleTo(userId, conv.id),
      ),
    )
    .limit(1);
  return { enabled: true, unread: !!row };
}
