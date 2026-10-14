// Modelo de dados do NuvemLeads — ARQUITETURA §3 + DECISOES §3, §7, §9.
// Colunas em snake_case no banco (drizzle `casing: "snake_case"`).
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Precisão de milissegundos: igual ao Date do JavaScript. Com microssegundos, comparações
// feitas com datas vindas do JS (cursor da paginação, "lida até") perdiam linhas.
const createdAt = () => timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow();
const ts = () => timestamp({ withTimezone: true, precision: 3 });

export const userStatus = pgEnum("user_status", ["ACTIVE", "INACTIVE"]);
export const avatarTone = pgEnum("avatar_tone", ["ACCENT", "NEUTRAL"]);
export const messageKind = pgEnum("message_kind", ["TEXT", "IMAGE", "VIDEO", "AUDIO", "FILE"]);
export const attachmentStatus = pgEnum("attachment_status", ["PENDING", "READY", "FAILED"]);
export const lockReason = pgEnum("lock_reason", ["TAB", "BLUR", "IDLE", "MANUAL", "REOPEN"]);

// ── Admin ────────────────────────────────────────────────────────────────

export const admins = pgTable("admins", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  passwordChangedAt: createdAt(),
  createdAt: createdAt(),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull().unique(), // sha256 do token do cookie
    adminId: uuid()
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    expiresAt: ts().notNull(),
    createdAt: createdAt(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index().on(t.adminId)],
);

export const passwordResets = pgTable("password_resets", {
  id: uuid().primaryKey().defaultRandom(),
  tokenHash: text().notNull().unique(),
  adminId: uuid()
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  expiresAt: ts().notNull(),
  usedAt: ts(),
});

/** Trilha de ações do admin — nunca guarda conteúdo de mensagens. */
export const adminEvents = pgTable("admin_events", {
  id: uuid().primaryKey().defaultRandom(),
  adminId: uuid()
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  action: text().notNull(), // USER_CREATED, USER_UPDATED, PIN_CHANGED, USER_DEACTIVATED, SETTINGS_UPDATED…
  targetId: uuid(),
  createdAt: createdAt(),
});

// ── Participantes ────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(), // link pessoal /u/<slug>
    /** Entrada pela página principal: usuário + PIN (DECISOES §29). Minúsculo, único. */
    username: text().unique(),
    name: text().notNull(),
    tone: avatarTone().notNull().default("NEUTRAL"),
    avatarKey: text(),
    pinHash: text().notNull(),
    pinVersion: integer().notNull().default(1), // incrementa ao trocar o PIN → derruba sessões
    /** DECISOES §9: a tela de PIN avisa uma vez quando o admin trocou o PIN. */
    pinChangedByAdminAt: ts(),
    pinNoticeSeen: boolean().notNull().default(true),
    status: userStatus().notNull().default("ACTIVE"),
    lastActiveAt: ts(),
    createdAt: createdAt(),
    updatedAt: createdAt().$onUpdate(() => new Date()),
  },
  (t) => [
    check("users_slug_length", sql`char_length(${t.slug}) >= 10`),
    check("users_username_format", sql`${t.username} ~ '^[a-z0-9._-]{3,24}$'`),
  ],
);

/**
 * Aparelho lembrado (DECISOES §29): depois do PIN certo, o navegador guarda um token por
 * 180 dias e passa a abrir direto na tela de PIN, com o aviso de mensagens novas.
 * Trocar o PIN (pinVersion) ou desativar a pessoa invalida o aparelho.
 */
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinVersion: integer().notNull(),
    expiresAt: ts().notNull(),
    lastUsedAt: createdAt(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinVersion: integer().notNull(),
    locked: boolean().notNull().default(false),
    lockReason: lockReason(),
    lockedAt: ts(),
    /** DECISOES §7: só o 1º carregamento depois do PIN entra desbloqueado. */
    fresh: boolean().notNull().default(false),
    lastSeenAt: createdAt(), // heartbeat com atividade real
    expiresAt: ts().notNull(), // teto absoluto: 12 h
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

// ── Conversa (DECISOES §3: pertence ao par de pessoas) ───────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid().primaryKey().defaultRandom(),
    userAId: uuid()
      .notNull()
      .references(() => users.id),
    userBId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex().on(t.userAId, t.userBId),
    // par sempre guardado em ordem (menor id primeiro), sem repetir a mesma pessoa
    check("conversations_pair_order", sql`${t.userAId} < ${t.userBId}`),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid().primaryKey().defaultRandom(),
    uploaderId: uuid()
      .notNull()
      .references(() => users.id),
    kind: messageKind().notNull(),
    storageKey: text().notNull(), // caminho relativo no volume: uploads/AAAA/MM/<id>.<ext>
    thumbKey: text(), // miniatura de imagem / capa de vídeo
    mime: text().notNull(),
    sizeBytes: integer().notNull(),
    originalName: text().notNull(),
    width: integer(),
    height: integer(),
    durationSec: integer(),
    status: attachmentStatus().notNull().default("PENDING"),
    createdAt: createdAt(),
  },
  (t) => [check("attachments_not_text", sql`${t.kind} <> 'TEXT'`)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id),
    clientId: uuid().notNull(), // gerado no cliente (idempotência)
    senderId: uuid()
      .notNull()
      .references(() => users.id),
    kind: messageKind().notNull(),
    body: varchar({ length: 4000 }), // texto ou legenda
    attachmentId: uuid()
      .unique()
      .references(() => attachments.id),
    createdAt: createdAt(),
    deliveredAt: ts(),
    readAt: ts(),
    /** Visualização única (DECISOES §30): o conteúdo nunca sai na lista, só ao abrir. */
    viewOnce: boolean().notNull().default(false),
    /** Quando a outra pessoa abriu a visualização única. */
    openedAt: ts(),
    /** Conteúdo apagado de verdade (visualização única aberta ou mídia expirada). */
    contentDeletedAt: ts(),
  },
  (t) => [
    uniqueIndex().on(t.senderId, t.clientId),
    index().on(t.conversationId, t.createdAt),
    // texto exige corpo; mídia exige anexo — a não ser que o conteúdo já tenha sido apagado
    check(
      "messages_kind_payload",
      sql`(${t.kind} = 'TEXT' AND ${t.attachmentId} IS NULL AND (${t.body} IS NOT NULL OR ${t.contentDeletedAt} IS NOT NULL)) OR (${t.kind} <> 'TEXT' AND (${t.attachmentId} IS NOT NULL OR ${t.contentDeletedAt} IS NOT NULL))`,
    ),
  ],
);

/**
 * "Apagar para mim" (DECISOES §31): a mensagem some só para esta pessoa. Quando as duas
 * apagaram (ou limparam a conversa), o conteúdo é apagado de verdade do servidor.
 */
export const hiddenMessages = pgTable(
  "hidden_messages",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] }), index().on(t.messageId)],
);

/** "Limpar conversa" (DECISOES §31): esta pessoa não vê nada criado até `clearedAt`. */
export const conversationClears = pgTable(
  "conversation_clears",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    clearedAt: ts().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conversationId] })],
);

// ── Configurações e limites ──────────────────────────────────────────────

export const settings = pgTable(
  "settings",
  {
    id: integer().primaryKey().default(1),
    autoLockMinutes: integer().notNull().default(5), // 1 | 5 | 15 | 30
    lockOnTabLeave: boolean().notNull().default(true),
    lockOnReopen: boolean().notNull().default(true),
    /** "Você tem novas mensagens" na tela de PIN do aparelho lembrado e na de bloqueio. */
    unreadNotice: boolean().notNull().default(true),
    /** Apagar mídias com mais de N dias (0 = nunca) — DECISOES §30. */
    mediaRetentionDays: integer().notNull().default(0),
  },
  (t) => [
    check("settings_singleton", sql`${t.id} = 1`),
    check("settings_auto_lock", sql`${t.autoLockMinutes} IN (1, 5, 15, 30)`),
    check("settings_media_retention", sql`${t.mediaRetentionDays} IN (0, 30, 90, 180, 365)`),
  ],
);

/** Contadores de tentativas (PIN e login admin) — DECISOES §8. */
export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(), // ex.: "pin:<userId>:<ip>", "pin-user:<userId>", "admin:<email>:<ip>"
  count: integer().notNull().default(0),
  windowStart: createdAt(),
  blockedUntil: ts(),
});

// ── Relações (consultas com `db.query`) ──────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  messages: many(messages),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  attachment: one(attachments, { fields: [messages.attachmentId], references: [attachments.id] }),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  admin: one(admins, { fields: [adminSessions.adminId], references: [admins.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Settings = typeof settings.$inferSelect;
