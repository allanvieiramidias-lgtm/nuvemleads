import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { trustedDevices, users } from "@/db/schema";
import { DEVICE_DAYS } from "@/lib/auth/cookies";
import { hashToken, newSessionToken } from "@/lib/auth/tokens";

/**
 * Aparelho lembrado (DECISOES §29). O navegador guarda um token opaco (só o hash fica no
 * banco). Ele não dá acesso à conversa: serve só para abrir direto a tela de PIN da pessoa
 * e para o aviso "Você tem novas mensagens". Vale enquanto a pessoa estiver ativa, o PIN
 * não tiver sido trocado e não passarem 180 dias desde o último PIN certo.
 */
export type DeviceInfo = { deviceId: string; userId: string; slug: string };

const expiry = (now: Date) => new Date(now.getTime() + DEVICE_DAYS * 24 * 3600_000);

export async function getDevice(
  db: Db,
  token: string | null | undefined,
): Promise<DeviceInfo | null> {
  if (!token) return null;
  const [row] = await db
    .select({ d: trustedDevices, u: users })
    .from(trustedDevices)
    .innerJoin(users, eq(users.id, trustedDevices.userId))
    .where(
      and(eq(trustedDevices.tokenHash, hashToken(token)), gt(trustedDevices.expiresAt, new Date())),
    );
  if (!row || row.u.status !== "ACTIVE" || row.d.pinVersion !== row.u.pinVersion) return null;
  return { deviceId: row.d.id, userId: row.u.id, slug: row.u.slug };
}

/**
 * Depois do PIN certo: renova o aparelho atual (se for desta pessoa) ou cria um novo.
 * Devolve o token para o cookie (o mesmo, quando renovado).
 */
export async function rememberDevice(
  db: Db,
  input: { userId: string; pinVersion: number; currentToken?: string | null },
): Promise<string> {
  const now = new Date();
  if (input.currentToken) {
    const [updated] = await db
      .update(trustedDevices)
      .set({ expiresAt: expiry(now), lastUsedAt: now, pinVersion: input.pinVersion })
      .where(
        and(
          eq(trustedDevices.tokenHash, hashToken(input.currentToken)),
          eq(trustedDevices.userId, input.userId),
        ),
      )
      .returning({ id: trustedDevices.id });
    if (updated) return input.currentToken;
  }
  const { token, tokenHash } = newSessionToken();
  await db.insert(trustedDevices).values({
    tokenHash,
    userId: input.userId,
    pinVersion: input.pinVersion,
    expiresAt: expiry(now),
  });
  await db.delete(trustedDevices).where(lt(trustedDevices.expiresAt, now));
  return token;
}

/** "Não é você? Trocar": este navegador esquece a pessoa. */
export async function forgetDevice(db: Db, token: string | null | undefined) {
  if (!token) return;
  await db.delete(trustedDevices).where(eq(trustedDevices.tokenHash, hashToken(token)));
}

/** Trocar o PIN ou desativar: nenhum aparelho continua lembrando a pessoa. */
export async function forgetUserDevices(
  db: Db | Parameters<Parameters<Db["transaction"]>[0]>[0],
  userId: string,
) {
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}
