import { and, count, desc, eq, gte, inArray, like, max } from "drizzle-orm";
import type { Db } from "@/db";
import { attachments, messages, rateLimits, users } from "@/db/schema";
import { getActiveConversation } from "./conversations";
import { avatarUrl } from "./avatars";

export type ActivityKind = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE";

export type Dashboard = {
  activeUsers: number;
  messageCount: number;
  fileCount: number;
  lastActivity: { at: Date; firstName: string } | null;
  /** Últimas 5 mensagens: só quem, tipo e quando — nunca o conteúdo (README §4.7). */
  recent: {
    id: string;
    firstName: string;
    name: string;
    tone: "ACCENT" | "NEUTRAL";
    avatarUrl: string | null;
    kind: ActivityKind;
    at: Date;
  }[];
  /** DECISOES §8: pessoas com 10+ erros de PIN em 24 h. */
  pinAlerts: { userId: string; firstName: string }[];
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export async function getDashboard(db: Db): Promise<Dashboard> {
  const [{ n: activeUsers } = { n: 0 }] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.status, "ACTIVE"));
  const conv = await getActiveConversation(db);
  const pinAlerts = await getPinAlerts(db);

  if (!conv)
    return {
      activeUsers,
      messageCount: 0,
      fileCount: 0,
      lastActivity: null,
      recent: [],
      pinAlerts,
    };

  const [{ n: messageCount } = { n: 0 }] = await db
    .select({ n: count() })
    .from(messages)
    .where(eq(messages.conversationId, conv.id));
  const [{ n: fileCount } = { n: 0 }] = await db
    .select({ n: count() })
    .from(messages)
    .innerJoin(attachments, eq(attachments.id, messages.attachmentId))
    .where(and(eq(messages.conversationId, conv.id), eq(attachments.status, "READY")));

  // Só colunas de metadados: o corpo da mensagem nunca é lido aqui.
  const rows = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      at: messages.createdAt,
      name: users.name,
      tone: users.tone,
      avatarKey: users.avatarKey,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conv.id))
    .orderBy(desc(messages.createdAt))
    .limit(5);

  const [last] = await db
    .select({ at: max(messages.createdAt) })
    .from(messages)
    .where(eq(messages.conversationId, conv.id));

  return {
    activeUsers,
    messageCount,
    fileCount,
    lastActivity: last?.at && rows[0] ? { at: last.at, firstName: firstName(rows[0].name) } : null,
    recent: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      at: r.at,
      name: r.name,
      firstName: firstName(r.name),
      tone: r.tone,
      avatarUrl: avatarUrl(r.avatarKey),
    })),
    pinAlerts,
  };
}

export const PIN_ALERT_THRESHOLD = 10;

async function getPinAlerts(db: Db): Promise<Dashboard["pinAlerts"]> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await db
    .select({ key: rateLimits.key, count: rateLimits.count })
    .from(rateLimits)
    .where(
      and(
        like(rateLimits.key, "pin-user:%"),
        gte(rateLimits.windowStart, since),
        gte(rateLimits.count, PIN_ALERT_THRESHOLD),
      ),
    );
  const ids = rows.map((r) => r.key.slice("pin-user:".length));
  if (!ids.length) return [];
  const people = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  return people.map((p) => ({ userId: p.id, firstName: firstName(p.name) }));
}

/** "Liberar tentativas": zera os contadores de PIN da pessoa (todos os IPs). */
export async function resetPinAttempts(db: Db, userId: string) {
  await db.delete(rateLimits).where(like(rateLimits.key, `pin-user:${userId}`));
  await db.delete(rateLimits).where(like(rateLimits.key, `pin:${userId}:%`));
}
