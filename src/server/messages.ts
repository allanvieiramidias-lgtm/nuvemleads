import { and, asc, desc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  attachments,
  conversationClears,
  hiddenMessages,
  messages,
  users,
  type Conversation,
} from "@/db/schema";
import { DomainError } from "./errors";
import { emit } from "./events";

export const MAX_BODY = 4000;

export type MessageStatus = "sent" | "delivered" | "read";

export type AttachmentDto = {
  id: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  mime: string;
  sizeBytes: number;
  name: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  status: "PENDING" | "READY" | "FAILED";
  hasThumb: boolean;
};

export type MessageDto = {
  id: string;
  clientId: string;
  senderId: string;
  kind: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  body: string | null;
  attachment: AttachmentDto | null;
  createdAt: string;
  status: MessageStatus;
  /** Visualização única: o conteúdo nunca vem na lista, só em POST /abrir (DECISOES §30). */
  viewOnce: boolean;
  /** Visualização única já aberta pela outra pessoa. */
  opened: boolean;
  /** Conteúdo apagado de verdade (aberta ou mídia expirada). */
  expired: boolean;
};

type Row = typeof messages.$inferSelect & { att: typeof attachments.$inferSelect | null };

function toAttachmentDto(r: Row): AttachmentDto | null {
  return r.att
    ? {
        id: r.att.id,
        kind: r.att.kind as AttachmentDto["kind"],
        mime: r.att.mime,
        sizeBytes: r.att.sizeBytes,
        name: r.att.originalName,
        width: r.att.width,
        height: r.att.height,
        durationSec: r.att.durationSec,
        status: r.att.status,
        hasThumb: !!r.att.thumbKey,
      }
    : null;
}

function toDto(r: Row): MessageDto {
  const hidden = r.viewOnce || !!r.contentDeletedAt;
  return {
    id: r.id,
    clientId: r.clientId,
    senderId: r.senderId,
    kind: r.kind,
    body: hidden ? null : r.body,
    attachment: hidden ? null : toAttachmentDto(r),
    createdAt: r.createdAt.toISOString(),
    status: r.readAt ? "read" : r.deliveredAt ? "delivered" : "sent",
    viewOnce: r.viewOnce,
    opened: !!r.openedAt,
    expired: !!r.contentDeletedAt,
  };
}

async function selectRows(
  db: Db,
  where: ReturnType<typeof and>,
  order: "asc" | "desc",
  limit?: number,
) {
  const q = db
    .select({ m: messages, att: attachments })
    .from(messages)
    .leftJoin(attachments, eq(attachments.id, messages.attachmentId))
    .where(where)
    .orderBy(
      order === "desc" ? desc(messages.createdAt) : asc(messages.createdAt),
      order === "desc" ? desc(messages.id) : asc(messages.id),
    );
  const rows = limit ? await q.limit(limit) : await q;
  return rows.map((r) => toDto({ ...r.m, att: r.att }));
}

/**
 * O que esta pessoa ainda vê (DECISOES §31): nada que ela apagou para si nem nada criado
 * até o momento em que limpou a conversa.
 */
export function visibleTo(viewerId: string, conversationId: string): SQL {
  return sql`not exists (select 1 from ${hiddenMessages} h where h.message_id = ${messages.id} and h.user_id = ${viewerId})
    and ${messages.createdAt} > coalesce((select c.cleared_at from ${conversationClears} c where c.user_id = ${viewerId} and c.conversation_id = ${conversationId}), '-infinity'::timestamptz)`;
}

/** Cursor opaco: "<createdAt ISO>|<id>" da mensagem mais antiga já carregada. */
function parseCursor(cursor: string | null | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("|");
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { at, id };
}

/**
 * Paginação reversa (mais novas primeiro no banco, devolvidas em ordem cronológica).
 * Marca como entregues as mensagens da outra pessoa que forem devolvidas (DECISOES §11).
 */
export async function listMessages(
  db: Db,
  conv: Conversation,
  viewerId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const c = parseCursor(opts.cursor);
  const where = and(
    eq(messages.conversationId, conv.id),
    visibleTo(viewerId, conv.id),
    c
      ? or(lt(messages.createdAt, c.at), and(eq(messages.createdAt, c.at), lt(messages.id, c.id)))
      : undefined,
  );
  const page = await selectRows(db, where, "desc", limit + 1);
  const hasMore = page.length > limit;
  const items = page.slice(0, limit).reverse();
  const oldest = items[0];

  const undelivered = items
    .filter((m) => m.senderId !== viewerId && m.status === "sent")
    .map((m) => m.id);
  if (undelivered.length) {
    await markDelivered(db, conv, viewerId, undelivered);
    for (const m of items) if (undelivered.includes(m.id)) m.status = "delivered";
  }
  return {
    messages: items,
    nextCursor: hasMore && oldest ? `${oldest.createdAt}|${oldest.id}` : null,
  };
}

export const TextMessageSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.literal("TEXT"),
  body: z
    .string()
    .max(MAX_BODY, `A mensagem pode ter até ${MAX_BODY} caracteres.`)
    .refine((s) => s.trim().length > 0, "A mensagem está vazia."),
  viewOnce: z.boolean().optional(),
});

/** Envia texto. Idempotente por (remetente, clientId): reenvio devolve a mesma mensagem. */
export async function createTextMessage(
  db: Db,
  conv: Conversation,
  senderId: string,
  input: { clientId: string; body: string; viewOnce?: boolean },
): Promise<{ message: MessageDto; created: boolean }> {
  const parsed = TextMessageSchema.safeParse({ ...input, kind: "TEXT" });
  if (!parsed.success) throw new DomainError("VALIDATION", parsed.error.issues[0]!.message);
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      clientId: input.clientId,
      senderId,
      kind: "TEXT",
      body: input.body,
      viewOnce: !!input.viewOnce,
    })
    .onConflictDoNothing({ target: [messages.senderId, messages.clientId] })
    .returning({ id: messages.id });

  const [existing] = await selectRows(
    db,
    and(eq(messages.senderId, senderId), eq(messages.clientId, input.clientId)),
    "asc",
  );
  if (!existing) throw new Error("Mensagem não encontrada após inserir");
  if (existing.senderId !== senderId)
    throw new DomainError("FORBIDDEN", "Mensagem de outra pessoa.");

  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, senderId));
  if (inserted) emit("message:new", { conversationId: conv.id, message: existing });
  return { message: existing, created: !!inserted };
}

/** "Entregue": o aparelho da outra pessoa recebeu. Só mensagens que não são do próprio leitor. */
export async function markDelivered(db: Db, conv: Conversation, viewerId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db
    .update(messages)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conv.id),
        inArray(messages.id, ids),
        ne(messages.senderId, viewerId),
        isNull(messages.deliveredAt),
      ),
    )
    .returning({ id: messages.id, senderId: messages.senderId });
  for (const r of rows)
    emit("message:status", {
      conversationId: conv.id,
      senderId: r.senderId,
      id: r.id,
      status: "delivered",
    });
}

/**
 * "Lida": a outra pessoa está com a conversa visível e desbloqueada. Marca tudo
 * da outra pessoa até `upToId` (inclusive). Retorna quantas mudaram.
 */
export async function markRead(
  db: Db,
  conv: Conversation,
  viewerId: string,
  upToId: string,
): Promise<number> {
  const [target] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, upToId), eq(messages.conversationId, conv.id)));
  if (!target) return 0;
  const now = new Date();
  // compara no próprio banco, sem passar a data pelo JavaScript
  const upTo = sql`(select m2.created_at from messages m2 where m2.id = ${upToId})`;
  const rows = await db
    .update(messages)
    .set({
      readAt: now,
      deliveredAt: sql`coalesce(${messages.deliveredAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(messages.conversationId, conv.id),
        ne(messages.senderId, viewerId),
        isNull(messages.readAt),
        lte(messages.createdAt, upTo),
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
  return rows.length;
}

export const AttachmentMessageSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO", "FILE"]),
  attachmentId: z.string().uuid(),
  caption: z.string().max(MAX_BODY).optional(),
  viewOnce: z.boolean().optional(),
});

/**
 * Mensagem com anexo já enviado. O anexo precisa ser de quem envia, do mesmo tipo
 * e ainda não usado. Idempotente por clientId.
 */
export async function createAttachmentMessage(
  db: Db,
  conv: Conversation,
  senderId: string,
  input: z.infer<typeof AttachmentMessageSchema>,
): Promise<{ message: MessageDto; created: boolean }> {
  const existing = await selectRows(
    db,
    and(eq(messages.senderId, senderId), eq(messages.clientId, input.clientId)),
    "asc",
  );
  if (existing[0]) return { message: existing[0], created: false };

  const [att] = await db.select().from(attachments).where(eq(attachments.id, input.attachmentId));
  if (!att || att.uploaderId !== senderId)
    throw new DomainError("NOT_FOUND", "Arquivo não encontrado.");
  if (att.kind !== input.kind) throw new DomainError("VALIDATION", "Tipo de arquivo não confere.");
  if (att.status === "FAILED")
    throw new DomainError("VALIDATION", "Não foi possível processar o arquivo.");
  const [used] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.attachmentId, att.id));
  if (used) throw new DomainError("VALIDATION", "Este arquivo já foi enviado.");

  const caption =
    input.kind === "IMAGE" || input.kind === "VIDEO" ? input.caption?.trim() || null : null;
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      clientId: input.clientId,
      senderId,
      kind: input.kind,
      body: caption,
      attachmentId: att.id,
      viewOnce: !!input.viewOnce,
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });
  const [row] = await selectRows(
    db,
    and(eq(messages.senderId, senderId), eq(messages.clientId, input.clientId)),
    "asc",
  );
  if (!row) throw new DomainError("VALIDATION", "Não foi possível enviar o arquivo.");
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, senderId));
  if (inserted) emit("message:new", { conversationId: conv.id, message: row });
  return { message: row, created: !!inserted };
}

/**
 * Uma mensagem pelo id. `reveal` devolve também o conteúdo escondido da visualização única
 * — usado só por openViewOnce, que já conferiu quem pode ver.
 */
export async function getMessageById(
  db: Db,
  id: string,
  opts: { reveal?: boolean } = {},
): Promise<{
  conversationId: string;
  message: MessageDto;
  revealedBody: string | null;
  revealedAttachment: AttachmentDto | null;
} | null> {
  const [r] = await db
    .select({ m: messages, att: attachments })
    .from(messages)
    .leftJoin(attachments, eq(attachments.id, messages.attachmentId))
    .where(eq(messages.id, id));
  if (!r) return null;
  const row = { ...r.m, att: r.att };
  return {
    conversationId: r.m.conversationId,
    message: toDto(row),
    revealedBody: opts.reveal && !r.m.contentDeletedAt ? r.m.body : null,
    revealedAttachment: opts.reveal && !r.m.contentDeletedAt ? toAttachmentDto(row) : null,
  };
}

export async function getMessageDto(db: Db, attachmentId: string): Promise<MessageDto | null> {
  const [row] = await selectRows(db, eq(messages.attachmentId, attachmentId), "asc");
  return row ?? null;
}
