import { unlink } from "node:fs/promises";
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { attachments, messages, type Conversation } from "@/db/schema";
import { resolveKey } from "@/lib/storage";
import { DomainError } from "./errors";
import { emit } from "./events";
import { getMessageById, type AttachmentDto } from "./messages";
import { getSettings } from "./settings";

/**
 * Visualização única e limpeza de mídias (DECISOES §30). Apagar é de verdade: o texto sai
 * do banco e os arquivos (original e miniatura) saem do disco. Só a "casca" da mensagem
 * fica, para a conversa mostrar "Aberta" ou "Mídia expirada".
 */

/** Depois de aberta, a mídia fica disponível só para quem abriu por este tempo (vídeo longo). */
export const VIEW_ONCE_GRACE_MS = 10 * 60_000;

export const VIEW_ONCE_GONE = "Esta mensagem de visualização única já foi aberta.";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function removeFiles(keys: (string | null)[]) {
  for (const key of keys) {
    if (!key) continue;
    try {
      await unlink(resolveKey(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

/** Apaga texto e anexo de uma mensagem. Devolve true se havia algo a apagar. */
export async function eraseMessageContent(db: Db, messageId: string): Promise<boolean> {
  const files = await db.transaction(async (tx: Tx) => {
    const [m] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.contentDeletedAt)))
      .for("update");
    if (!m) return null;
    await tx
      .update(messages)
      .set({ body: null, attachmentId: null, contentDeletedAt: new Date() })
      .where(eq(messages.id, m.id));
    if (!m.attachmentId) return [] as (string | null)[];
    const [att] = await tx
      .delete(attachments)
      .where(eq(attachments.id, m.attachmentId))
      .returning({ storageKey: attachments.storageKey, thumbKey: attachments.thumbKey });
    return att ? [att.storageKey, att.thumbKey] : [];
  });
  if (files === null) return false;
  await removeFiles(files);
  const dto = await getMessageById(db, messageId);
  if (dto) emit("message:updated", { conversationId: dto.conversationId, message: dto.message });
  return true;
}

/**
 * Abrir a visualização única: só quem recebeu, só uma vez. O texto vai nesta resposta e
 * nunca mais; a mídia fica liberada só para esta pessoa por VIEW_ONCE_GRACE_MS.
 */
export async function openViewOnce(
  db: Db,
  conv: Conversation,
  viewerId: string,
  messageId: string,
): Promise<{ body: string | null; attachment: AttachmentDto | null }> {
  const [m] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conv.id)));
  if (!m || !m.viewOnce || m.senderId === viewerId)
    throw new DomainError("NOT_FOUND", "Mensagem não encontrada.");
  if (m.openedAt || m.contentDeletedAt) throw new DomainError("GONE", VIEW_ONCE_GONE);

  const now = new Date();
  const [opened] = await db
    .update(messages)
    .set({ openedAt: now, readAt: m.readAt ?? now, deliveredAt: m.deliveredAt ?? now })
    .where(and(eq(messages.id, m.id), isNull(messages.openedAt)))
    .returning({ id: messages.id });
  if (!opened) throw new DomainError("GONE", VIEW_ONCE_GONE); // duas abas ao mesmo tempo

  const full = await getMessageById(db, m.id, { reveal: true });
  if (m.kind === "TEXT")
    await eraseMessageContent(db, m.id); // o texto já saiu nesta resposta
  else if (full) emit("message:updated", { conversationId: conv.id, message: full.message });
  return { body: full?.revealedBody ?? null, attachment: full?.revealedAttachment ?? null };
}

/** Fechar o visor: a mídia aberta é apagada na hora. */
export async function closeViewOnce(
  db: Db,
  conv: Conversation,
  viewerId: string,
  messageId: string,
): Promise<void> {
  const [m] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conv.id)));
  if (!m || !m.viewOnce || m.senderId === viewerId || !m.openedAt) return;
  await eraseMessageContent(db, m.id);
}

/** Varredura: visualização única aberta há mais que o tempo de graça (aba fechada no meio). */
export async function sweepViewOnce(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.viewOnce, true),
        isNotNull(messages.openedAt),
        isNull(messages.contentDeletedAt),
        lt(messages.openedAt, new Date(now.getTime() - VIEW_ONCE_GRACE_MS)),
      ),
    );
  for (const r of rows) await eraseMessageContent(db, r.id);
  return rows.length;
}

// ── Painel de mídias (admin): só números, nunca conteúdo ─────────────────

export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
export const MEDIA_KINDS: MediaKind[] = ["IMAGE", "VIDEO", "AUDIO", "FILE"];

/** Mensagens com mídia ainda guardada, criadas antes de `before`, dos tipos pedidos. */
function purgeable(before: Date, kinds: MediaKind[]) {
  return and(
    isNotNull(messages.attachmentId),
    isNull(messages.contentDeletedAt),
    lt(messages.createdAt, before),
    inArray(messages.kind, kinds),
  );
}

export async function purgePreview(
  db: Db,
  input: { before: Date; kinds: MediaKind[] },
): Promise<{ count: number; bytes: number }> {
  if (!input.kinds.length) return { count: 0, bytes: 0 };
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::bigint`,
    })
    .from(messages)
    .innerJoin(attachments, eq(attachments.id, messages.attachmentId))
    .where(purgeable(input.before, input.kinds));
  return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
}

export async function purgeMedia(
  db: Db,
  input: { before: Date; kinds: MediaKind[] },
): Promise<{ count: number; bytes: number }> {
  const preview = await purgePreview(db, input);
  if (!preview.count) return preview;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(purgeable(input.before, input.kinds));
  for (const r of rows) await eraseMessageContent(db, r.id);
  return preview;
}

/** Limpeza automática pela idade definida no painel (0 = nunca). */
export async function purgeByRetention(db: Db, now = new Date()): Promise<number> {
  const days = (await getSettings(db)).mediaRetentionDays;
  if (!days) return 0;
  const { count } = await purgeMedia(db, {
    before: new Date(now.getTime() - days * 86_400_000),
    kinds: MEDIA_KINDS,
  });
  return count;
}

export type MediaStats = {
  total: { count: number; bytes: number };
  byKind: Record<MediaKind, { count: number; bytes: number }>;
  byMonth: { month: string; count: number; bytes: number }[];
  expired: number;
};

/** Uso de espaço: anexos guardados no disco (enviados ou ainda não), por tipo e por mês. */
export async function mediaStats(db: Db, now = new Date()): Promise<MediaStats> {
  const kindRows = await db
    .select({
      kind: attachments.kind,
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::bigint`,
    })
    .from(attachments)
    .groupBy(attachments.kind);
  const byKind = Object.fromEntries(
    MEDIA_KINDS.map((k) => [k, { count: 0, bytes: 0 }]),
  ) as MediaStats["byKind"];
  for (const r of kindRows)
    if (r.kind !== "TEXT")
      byKind[r.kind as MediaKind] = { count: Number(r.count), bytes: Number(r.bytes) };
  const total = Object.values(byKind).reduce(
    (t, k) => ({ count: t.count + k.count, bytes: t.bytes + k.bytes }),
    { count: 0, bytes: 0 },
  );

  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const month = sql<string>`to_char(date_trunc('month', ${attachments.createdAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM')`;
  const monthRows = await db
    .select({
      month,
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::bigint`,
    })
    .from(attachments)
    .where(gte(attachments.createdAt, since))
    .groupBy(month)
    .orderBy(month);

  const [exp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(isNotNull(messages.contentDeletedAt), ne(messages.kind, "TEXT")));

  return {
    total,
    byKind,
    byMonth: monthRows.map((r) => ({
      month: r.month,
      count: Number(r.count),
      bytes: Number(r.bytes),
    })),
    expired: Number(exp?.n ?? 0),
  };
}
