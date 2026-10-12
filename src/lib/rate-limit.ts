import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema";

export type LimitRule = {
  /** Erros dentro da janela que disparam o bloqueio. */
  max: number;
  windowMs: number;
  blockMs: number;
};

/** Admin: 5 erros por e-mail+IP em 15 min → 15 min de bloqueio (ARQUITETURA §7). */
export const ADMIN_LOGIN_RULE: LimitRule = { max: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
/** "Esqueci minha senha": até 5 pedidos por IP em 15 min (evita usar o formulário para spam). */
export const PASSWORD_FORGOT_RULE: LimitRule = {
  max: 5,
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
};

/** Segundos até liberar; 0 se não estiver bloqueado. */
export async function retryAfter(db: Db, key: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ blockedUntil: rateLimits.blockedUntil })
    .from(rateLimits)
    .where(eq(rateLimits.key, key));
  if (!row?.blockedUntil || row.blockedUntil <= now) return 0;
  return Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000);
}

/**
 * Registra uma tentativa (erro ou pedido) de forma atômica. A janela recomeça quando
 * expira ou quando um bloqueio anterior já passou. Retorna os segundos de bloqueio (0 = livre).
 */
export async function registerHit(
  db: Db,
  key: string,
  rule: LimitRule,
  now = new Date(),
): Promise<number> {
  const windowStartLimit = new Date(now.getTime() - rule.windowMs);
  const blockUntil = new Date(now.getTime() + rule.blockMs);
  // Tipos explícitos: parâmetros dentro de CASE chegariam como texto.
  const nowP = sql`${now.toISOString()}::timestamptz`;
  const startLimit = sql`${windowStartLimit.toISOString()}::timestamptz`;
  const until = sql`${blockUntil.toISOString()}::timestamptz`;
  const max = sql`${rule.max}::int`;
  const expired = sql`(r.window_start < ${startLimit} or (r.blocked_until is not null and r.blocked_until <= ${nowP}))`;
  const rows = await db.execute<{ count: number; blocked_until: Date | string | null }>(sql`
    insert into rate_limits as r (key, count, window_start, blocked_until)
    values (${key}, 1, ${nowP}, case when 1 >= ${max} then ${until} else null end)
    on conflict (key) do update set
      count = case when ${expired} then 1 else r.count + 1 end,
      window_start = case when ${expired} then ${nowP} else r.window_start end,
      blocked_until = case
        when ${expired} then (case when 1 >= ${max} then ${until} else null end)
        when r.count + 1 >= ${max} then ${until}
        else r.blocked_until end
    returning count, blocked_until
  `);
  const row = rows.rows[0];
  if (!row?.blocked_until) return 0;
  const blockedAt = new Date(row.blocked_until);
  return blockedAt > now ? Math.ceil((blockedAt.getTime() - now.getTime()) / 1000) : 0;
}

export async function clearLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
