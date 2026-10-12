import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { adminSessions, admins } from "@/db/schema";
import { hashSecret, verifySecret } from "@/lib/auth/hash";
import { hashToken } from "@/lib/auth/tokens";
import { MSG, passwordSchema } from "@/lib/validators";
import { DomainError } from "./errors";

export const AccountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do administrador.").max(60),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(200),
});

export async function updateAccount(db: Db, adminId: string, input: unknown) {
  const parsed = AccountSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new DomainError("VALIDATION", issue.message, { [String(issue.path[0])]: issue.message });
  }
  const { name, email } = parsed.data;
  const [taken] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(and(eq(admins.email, email), ne(admins.id, adminId)));
  if (taken)
    throw new DomainError("VALIDATION", "Este e-mail já está em uso.", {
      email: "Este e-mail já está em uso.",
    });
  const [row] = await db
    .update(admins)
    .set({ name, email })
    .where(eq(admins.id, adminId))
    .returning();
  return { name: row!.name, email: row!.email };
}

export const WRONG_CURRENT_PASSWORD = "A senha atual não confere.";

/** Troca a senha pedindo a atual; encerra as outras sessões de admin, mantendo esta. */
export async function changeAdminPassword(
  db: Db,
  adminId: string,
  input: { current: string; next: string },
  currentToken: string | undefined,
) {
  const next = passwordSchema.safeParse(input.next);
  if (!next.success)
    throw new DomainError("VALIDATION", MSG.passwordShort, { next: MSG.passwordShort });
  const [admin] = await db.select().from(admins).where(eq(admins.id, adminId));
  if (!admin || !(await verifySecret(admin.passwordHash, input.current))) {
    throw new DomainError("VALIDATION", WRONG_CURRENT_PASSWORD, {
      current: WRONG_CURRENT_PASSWORD,
    });
  }
  const passwordHash = await hashSecret(next.data);
  await db.transaction(async (tx) => {
    await tx
      .update(admins)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(admins.id, adminId));
    const keep = currentToken ? hashToken(currentToken) : "";
    await tx
      .delete(adminSessions)
      .where(and(eq(adminSessions.adminId, adminId), ne(adminSessions.tokenHash, keep)));
  });
}
