import { and, asc, count, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "@/db";
import { userSessions, users, type User } from "@/db/schema";
import { hashSecret } from "@/lib/auth/hash";
import { newSlug } from "@/lib/auth/tokens";
import { MSG, pinSchema, suggestUsername, userNameSchema, usernameSchema } from "@/lib/validators";
import { forgetUserDevices } from "./devices";
import { DomainError } from "./errors";
import { emit } from "./events";

/** Tudo o que pode sair do serviço — nunca o hash do PIN. */
export type PublicUser = Omit<User, "pinHash">;

export function toPublicUser(u: User): PublicUser {
  const { pinHash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

const MAX_ACTIVE = 2;
// Trava de transação que serializa toda mudança de status (regra dos 2 ativos).
const ACTIVE_USERS_LOCK = 72_016_001;

async function lockActiveUsers(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${ACTIVE_USERS_LOCK})`);
}

export async function countActive(db: DbOrTx, exceptId?: string): Promise<number> {
  const where = exceptId
    ? and(eq(users.status, "ACTIVE"), sql`${users.id} <> ${exceptId}`)
    : eq(users.status, "ACTIVE");
  const [row] = await db.select({ n: count() }).from(users).where(where);
  return row?.n ?? 0;
}

/** Ao criar com 2 ativos, o padrão já vem "Inativo" (README §4.9). */
export async function defaultStatusForNewUser(db: Db): Promise<"ACTIVE" | "INACTIVE"> {
  return (await countActive(db)) >= MAX_ACTIVE ? "INACTIVE" : "ACTIVE";
}

export async function getActiveUsers(db: DbOrTx): Promise<PublicUser[]> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.status, "ACTIVE"))
    .orderBy(asc(users.createdAt));
  return rows.map(toPublicUser);
}

async function uniqueSlug(db: DbOrTx): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = newSlug();
    const [hit] = await db.select({ id: users.id }).from(users).where(eq(users.slug, slug));
    if (!hit) return slug;
  }
  throw new Error("Não foi possível gerar um link único");
}

function validate<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const message = r.error.issues[0]?.message ?? "Valor inválido.";
    throw new DomainError("VALIDATION", message, { [field]: message });
  }
  return r.data;
}

/** Usuário repetido: o banco recusa (índice único) e devolvemos o erro no campo. */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const c = e?.cause ?? e;
  return c?.code === "23505" && (c.constraint ?? "").includes(constraint);
}

export async function assertUsernameFree(db: DbOrTx, username: string, exceptId?: string) {
  const [hit] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (hit && hit.id !== exceptId)
    throw new DomainError("VALIDATION", MSG.usernameTaken, { username: MSG.usernameTaken });
}

/** Primeiro nome sem acento; se já existir, acrescenta um número. */
export async function uniqueUsername(db: DbOrTx, name: string): Promise<string> {
  let base = suggestUsername(name).slice(0, 20);
  if (base.length < 3) base = `${base}pessoa`.slice(0, 20);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? base : `${base}${i}`;
    const [hit] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate));
    if (!hit) return candidate;
  }
  throw new Error("Não foi possível gerar um usuário único");
}

const takenError = () =>
  new DomainError("VALIDATION", MSG.usernameTaken, { username: MSG.usernameTaken });

export type CreateUserInput = {
  name: string;
  /** Sem usuário, um é gerado a partir do nome ("maria", "maria2"…). */
  username?: string;
  pin: string;
  status: "ACTIVE" | "INACTIVE";
  tone?: "ACCENT" | "NEUTRAL";
  avatarKey?: string | null;
};

export async function createUser(db: Db, input: CreateUserInput): Promise<PublicUser> {
  const name = validate(userNameSchema, input.name, "name");
  const chosen =
    input.username !== undefined ? validate(usernameSchema, input.username, "username") : null;
  const pin = validate(pinSchema, input.pin, "pin");
  if (chosen) await assertUsernameFree(db, chosen);
  const pinHash = await hashSecret(pin); // fora da transação: argon2 é lento de propósito

  return db
    .transaction(async (tx) => {
      await lockActiveUsers(tx);
      if (input.status === "ACTIVE" && (await countActive(tx)) >= MAX_ACTIVE) {
        throw new DomainError("ROOM_FULL", MSG.roomFullForm, { status: MSG.roomFullForm });
      }
      // Gerado dentro da trava: duas criações ao mesmo tempo não pegam o mesmo usuário.
      const username = chosen ?? (await uniqueUsername(tx, name));
      const [user] = await tx
        .insert(users)
        .values({
          name,
          username,
          pinHash,
          status: input.status,
          tone: input.tone ?? "NEUTRAL",
          avatarKey: input.avatarKey ?? null,
          slug: await uniqueSlug(tx),
        })
        .returning();
      return toPublicUser(user!);
    })
    .catch((err: unknown) => {
      if (isUniqueViolation(err, "username")) throw takenError();
      throw err;
    });
}

/** Ativar/desativar. Desativar encerra as sessões da pessoa na hora (README §4.8). */
export async function setUserStatus(
  db: Db,
  userId: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<PublicUser> {
  const result = await db.transaction(async (tx) => {
    await lockActiveUsers(tx);
    const [current] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!current) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    if (current.status === status) return toPublicUser(current);

    if (status === "ACTIVE" && (await countActive(tx, userId)) >= MAX_ACTIVE) {
      throw new DomainError("ROOM_FULL", MSG.roomFull);
    }
    const [updated] = await tx
      .update(users)
      .set({ status })
      .where(eq(users.id, userId))
      .returning();
    if (status === "INACTIVE") {
      await tx.delete(userSessions).where(eq(userSessions.userId, userId));
      await forgetUserDevices(tx, userId);
    }
    return toPublicUser(updated!);
  });
  if (status === "INACTIVE") emit("session:revoked", { userId, reason: "DEACTIVATED" });
  emit("room:changed", {});
  return result;
}

export async function updateUserProfile(
  db: Db,
  userId: string,
  patch: {
    name?: string;
    username?: string;
    avatarKey?: string | null;
    tone?: "ACCENT" | "NEUTRAL";
  },
): Promise<PublicUser> {
  const values: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) values.name = validate(userNameSchema, patch.name, "name");
  if (patch.username !== undefined) {
    values.username = validate(usernameSchema, patch.username, "username");
    await assertUsernameFree(db, values.username, userId);
  }
  if (patch.avatarKey !== undefined) values.avatarKey = patch.avatarKey;
  if (patch.tone !== undefined) values.tone = patch.tone;
  const [updated] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, userId))
    .returning()
    .catch((err: unknown) => {
      if (isUniqueViolation(err, "username")) throw takenError();
      throw err;
    });
  if (!updated) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
  return toPublicUser(updated);
}

/**
 * Troca o PIN: o atual deixa de funcionar na hora, as sessões caem (pinVersion++)
 * e a pessoa vê o aviso "Seu PIN foi alterado pelo administrador." uma vez (DECISOES §9).
 */
export async function changeUserPin(db: Db, userId: string, newPin: string): Promise<PublicUser> {
  const pin = validate(pinSchema, newPin, "pin");
  const pinHash = await hashSecret(pin);
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        pinHash,
        pinVersion: sql`${users.pinVersion} + 1`,
        pinChangedByAdminAt: new Date(),
        pinNoticeSeen: false,
      })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    await tx.delete(userSessions).where(eq(userSessions.userId, userId));
    await forgetUserDevices(tx, userId);
    return toPublicUser(updated);
  });
  emit("session:revoked", { userId, reason: "PIN_CHANGED" });
  return result;
}

/** Lista para o admin (sem hash do PIN), na ordem de criação. */
export async function listUsers(db: Db): Promise<PublicUser[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return rows.map(toPublicUser);
}

export async function getUser(db: Db, userId: string): Promise<PublicUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ? toPublicUser(row) : null;
}

/** "Gerar novo link": o link antigo para de funcionar (DECISOES §13). */
export async function regenerateSlug(db: Db, userId: string): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ slug: await uniqueSlug(tx) })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    return toPublicUser(updated);
  });
}
