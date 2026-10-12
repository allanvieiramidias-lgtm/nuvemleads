import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { adminSessions, admins, passwordResets } from "@/db/schema";
import { ADMIN_SESSION_HOURS } from "@/lib/auth/cookies";
import { dummyHash, hashSecret, verifySecret } from "@/lib/auth/hash";
import { hashToken, newSessionToken } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/mailer";
import {
  ADMIN_LOGIN_RULE,
  PASSWORD_FORGOT_RULE,
  clearLimit,
  registerHit,
  retryAfter,
} from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/validators";
import { DomainError } from "./errors";

export const ADMIN_LOGIN_ERROR = "Não foi possível entrar. Verifique seus dados.";
export const ADMIN_TOO_MANY = "Muitas tentativas. Tente novamente em alguns minutos.";
export const RESET_EXPIRED = "Este link expirou. Peça um novo.";

const SESSION_MS = ADMIN_SESSION_HOURS * 3600_000;
const RENEW_WHEN_LEFT_MS = SESSION_MS - 30 * 60_000; // renova no máximo a cada 30 min
const RESET_MS = 30 * 60_000;

export type AdminProfile = { id: string; name: string; email: string; passwordChangedAt: Date };

const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function loginAdmin(
  db: Db,
  input: { email: string; password: string; ip: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; admin: AdminProfile }> {
  const email = normalizeEmail(input.email);
  const key = `admin:${email}:${input.ip}`;

  const wait = await retryAfter(db, key);
  if (wait > 0) throw new DomainError("TOO_MANY", ADMIN_TOO_MANY, { retryAfter: String(wait) });

  const [admin] = await db.select().from(admins).where(eq(admins.email, email));
  // Compara mesmo sem conta, para o tempo de resposta não revelar se o e-mail existe.
  const ok = await verifySecret(admin?.passwordHash ?? (await dummyHash()), input.password);

  if (!admin || !ok) {
    const blocked = await registerHit(db, key, ADMIN_LOGIN_RULE);
    if (blocked > 0)
      throw new DomainError("TOO_MANY", ADMIN_TOO_MANY, { retryAfter: String(blocked) });
    throw new DomainError("FORBIDDEN", ADMIN_LOGIN_ERROR);
  }

  await clearLimit(db, key);
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db.insert(adminSessions).values({
    tokenHash,
    adminId: admin.id,
    expiresAt,
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });
  // aproveita para limpar sessões vencidas
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  return { token, expiresAt, admin: toProfile(admin) };
}

function toProfile(a: typeof admins.$inferSelect): AdminProfile {
  return { id: a.id, name: a.name, email: a.email, passwordChangedAt: a.passwordChangedAt };
}

/** Valida o token do cookie. Renovação deslizante: 8 h desde a última atividade. */
export async function getAdminByToken(
  db: Db,
  token: string | undefined | null,
): Promise<AdminProfile | null> {
  if (!token) return null;
  const now = new Date();
  const [row] = await db
    .select({ session: adminSessions, admin: admins })
    .from(adminSessions)
    .innerJoin(admins, eq(admins.id, adminSessions.adminId))
    .where(and(eq(adminSessions.tokenHash, hashToken(token)), gt(adminSessions.expiresAt, now)));
  if (!row) return null;
  if (row.session.expiresAt.getTime() - now.getTime() < RENEW_WHEN_LEFT_MS) {
    await db
      .update(adminSessions)
      .set({ expiresAt: new Date(now.getTime() + SESSION_MS) })
      .where(eq(adminSessions.id, row.session.id));
  }
  return toProfile(row.admin);
}

export async function logoutAdmin(db: Db, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
}

/**
 * "Esqueci minha senha": responde sempre igual (não revela se o e-mail existe).
 * Se existir, envia um link válido por 30 min e invalida links anteriores.
 */
export async function requestPasswordReset(
  db: Db,
  input: { email: string; ip: string; appUrl: string },
): Promise<void> {
  if ((await registerHit(db, `forgot:${input.ip}`, PASSWORD_FORGOT_RULE)) > 0) return;

  const email = normalizeEmail(input.email);
  const [admin] = await db.select().from(admins).where(eq(admins.email, email));
  if (!admin) return;

  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.adminId, admin.id), isNull(passwordResets.usedAt)));

  const { token, tokenHash } = newSessionToken();
  await db.insert(passwordResets).values({
    tokenHash,
    adminId: admin.id,
    expiresAt: new Date(Date.now() + RESET_MS),
  });

  const link = `${input.appUrl.replace(/\/$/, "")}/admin/redefinir-senha?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: admin.email,
    subject: "NuvemLeads — redefinir senha",
    text: [
      `Olá, ${admin.name}.`,
      "",
      "Recebemos um pedido para criar uma nova senha de administrador do NuvemLeads.",
      `Abra este link em até 30 minutos: ${link}`,
      "",
      "Se não foi você, ignore este e-mail. Sua senha continua a mesma.",
    ].join("\n"),
  });
}

/** O link ainda vale? (para a tela mostrar o formulário ou o aviso de expirado). */
export async function isResetTokenValid(
  db: Db,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    );
  return !!row;
}

/** Troca a senha pelo link do e-mail e encerra todas as sessões de admin. */
export async function resetPassword(
  db: Db,
  input: { token: string; password: string },
): Promise<void> {
  const parsed = passwordSchema.safeParse(input.password);
  if (!parsed.success) {
    const message = parsed.error.issues[0]!.message;
    throw new DomainError("VALIDATION", message, { password: message });
  }
  const passwordHash = await hashSecret(parsed.data);
  await db.transaction(async (tx) => {
    const [reset] = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.tokenHash, hashToken(input.token)),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!reset) throw new DomainError("NOT_FOUND", RESET_EXPIRED);
    await tx
      .update(admins)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(admins.id, reset.adminId));
    await tx.delete(adminSessions).where(eq(adminSessions.adminId, reset.adminId));
  });
}
