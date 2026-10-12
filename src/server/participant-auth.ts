import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { userSessions, users, type User } from "@/db/schema";
import { USER_SESSION_HOURS } from "@/lib/auth/cookies";
import { dummyHash, verifySecret } from "@/lib/auth/hash";
import { hashToken, newSessionToken } from "@/lib/auth/tokens";
import { avatarUrl } from "./avatars";
import { DomainError } from "./errors";
import { pinRetryAfter, registerPinFailure, registerPinSuccess } from "./pin-limits";
import { getSettings } from "./settings";

export const PIN_INVALID = "PIN incorreto. Tente novamente.";
export const PIN_TOO_MANY = "Muitas tentativas. Aguarde alguns segundos.";
export const LINK_INVALID = "Este link não é válido. Peça um novo link ao administrador.";

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const initials = (n: string) => {
  const p = n.trim().split(/\s+/);
  return (
    (p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : (p[0]?.[1] ?? ""))
  ).toUpperCase();
};

/** Dados mínimos para a tela de PIN (ARQUITETURA §5). Inativo ou inexistente → null. */
export type PublicProfile = {
  name: string;
  firstName: string;
  initials: string;
  tone: "ACCENT" | "NEUTRAL";
  avatarUrl: string | null;
  /** DECISOES §9: avisar uma vez que o admin trocou o PIN. */
  pinChangedByAdmin: boolean;
};

async function activeBySlug(db: Db, slug: string): Promise<User | null> {
  if (!/^[a-z0-9]{10,40}$/.test(slug)) return null;
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.slug, slug), eq(users.status, "ACTIVE")));
  return u ?? null;
}

export async function getPublicProfile(db: Db, slug: string): Promise<PublicProfile | null> {
  const u = await activeBySlug(db, slug);
  if (!u) return null;
  return {
    name: u.name,
    firstName: firstName(u.name),
    initials: initials(u.name),
    tone: u.tone,
    avatarUrl: avatarUrl(u.avatarKey),
    pinChangedByAdmin: !u.pinNoticeSeen,
  };
}

export async function loginWithPin(
  db: Db,
  input: { slug: string; pin: string; ip: string },
): Promise<{ token: string; expiresAt: Date; userId: string }> {
  const user = await activeBySlug(db, input.slug);
  if (!user) {
    await verifySecret(await dummyHash(), input.pin); // mesmo tempo de resposta
    throw new DomainError("NOT_FOUND", LINK_INVALID);
  }

  const wait = await pinRetryAfter(db, user.id, input.ip);
  if (wait > 0) throw new DomainError("TOO_MANY", PIN_TOO_MANY, { retryAfter: String(wait) });

  if (!/^\d{6}$/.test(input.pin) || !(await verifySecret(user.pinHash, input.pin))) {
    const { retryAfter, attemptsLeft } = await registerPinFailure(db, user.id, input.ip);
    if (retryAfter > 0)
      throw new DomainError("TOO_MANY", PIN_TOO_MANY, { retryAfter: String(retryAfter) });
    throw new DomainError("INVALID_PIN", PIN_INVALID, { attemptsLeft: String(attemptsLeft) });
  }

  await registerPinSuccess(db, user.id, input.ip);
  const { token, tokenHash } = newSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + USER_SESSION_HOURS * 3600_000);
  await db.insert(userSessions).values({
    tokenHash,
    userId: user.id,
    pinVersion: user.pinVersion,
    fresh: true,
    expiresAt,
  });
  await db
    .update(users)
    .set({ pinNoticeSeen: true, lastActiveAt: now })
    .where(eq(users.id, user.id));
  await db.delete(userSessions).where(lt(userSessions.expiresAt, now));
  return { token, expiresAt, userId: user.id };
}

export type SessionInfo = {
  sessionId: string;
  user: {
    id: string;
    name: string;
    slug: string;
    tone: "ACCENT" | "NEUTRAL";
    avatarUrl: string | null;
  };
  locked: boolean;
  lockReason: "TAB" | "BLUR" | "IDLE" | "MANUAL" | "REOPEN" | null;
  lockedAt: Date | null;
};

/**
 * Sessão válida do cookie: não expirou, pessoa ativa e PIN não trocado desde o login.
 * Qualquer falha → null (o chamador manda para o PIN).
 */
export async function getSessionByToken(
  db: Db,
  token: string | null | undefined,
): Promise<SessionInfo | null> {
  if (!token) return null;
  const [row] = await db
    .select({ s: userSessions, u: users })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(eq(userSessions.tokenHash, hashToken(token)), gt(userSessions.expiresAt, new Date())),
    );
  if (!row || row.u.status !== "ACTIVE" || row.s.pinVersion !== row.u.pinVersion) return null;
  return {
    sessionId: row.s.id,
    user: {
      id: row.u.id,
      name: row.u.name,
      slug: row.u.slug,
      tone: row.u.tone,
      avatarUrl: avatarUrl(row.u.avatarKey),
    },
    locked: row.s.locked,
    lockReason: row.s.lockReason,
    lockedAt: row.s.lockedAt,
  };
}

/**
 * Carregamento completo de /chat (DECISOES §7): o primeiro depois do PIN entra
 * desbloqueado; os seguintes começam bloqueados se "Exigir PIN ao reabrir" estiver ligado.
 */
export async function bootSession(db: Db, session: SessionInfo): Promise<SessionInfo> {
  const [s] = await db.select().from(userSessions).where(eq(userSessions.id, session.sessionId));
  if (!s) return session;
  if (s.fresh) {
    await db
      .update(userSessions)
      .set({ fresh: false, lastSeenAt: new Date() })
      .where(eq(userSessions.id, s.id));
    return session;
  }
  if (!s.locked && (await getSettings(db)).lockOnReopen) {
    const lockedAt = new Date();
    await db
      .update(userSessions)
      .set({ locked: true, lockReason: "REOPEN", lockedAt })
      .where(eq(userSessions.id, s.id));
    return { ...session, locked: true, lockReason: "REOPEN", lockedAt };
  }
  return session;
}

export async function logoutSession(db: Db, token: string | null | undefined) {
  if (!token) return;
  await db.delete(userSessions).where(eq(userSessions.tokenHash, hashToken(token)));
}

/** Para a tela de acesso com PUBLIC_PICKER=true: só primeiro nome e iniciais. */
export async function listActiveForPicker(db: Db) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.status, "ACTIVE"))
    .orderBy(users.createdAt);
  return rows.map((u) => ({
    slug: u.slug,
    firstName: firstName(u.name),
    initials: initials(u.name),
    tone: u.tone,
  }));
}
