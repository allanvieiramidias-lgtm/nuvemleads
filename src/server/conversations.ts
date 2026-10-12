import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { conversations, type Conversation } from "@/db/schema";
import { getActiveUsers } from "./users";

/** Par sempre em ordem (menor id primeiro), igual à restrição do banco. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getOrCreateConversation(db: Db, a: string, b: string): Promise<Conversation> {
  if (a === b) throw new Error("Uma conversa precisa de duas pessoas diferentes");
  const [userAId, userBId] = orderedPair(a, b);
  await db.insert(conversations).values({ userAId, userBId }).onConflictDoNothing();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userAId, userAId), eq(conversations.userBId, userBId)));
  return conv!;
}

/**
 * A conversa exibida é a do par ativo atual (DECISOES §3). Trocar uma das pessoas
 * leva a uma conversa vazia; reativar a mesma dupla volta à conversa antiga.
 * Retorna null se não houver exatamente duas pessoas ativas.
 */
export async function getActiveConversation(db: Db): Promise<Conversation | null> {
  const active = await getActiveUsers(db);
  if (active.length !== 2) return null;
  return getOrCreateConversation(db, active[0]!.id, active[1]!.id);
}

/** Quem é a outra pessoa da conversa. */
export function otherParticipant(conv: Conversation, userId: string): string {
  if (conv.userAId === userId) return conv.userBId;
  if (conv.userBId === userId) return conv.userAId;
  throw new Error("Usuário não participa desta conversa");
}
