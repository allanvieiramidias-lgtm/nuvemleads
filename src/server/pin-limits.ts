import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Tentativas de PIN — DECISOES §8 (sem bloqueio permanente):
 * - por pessoa + IP: 3 erros → 15 s; 5 erros em 15 min → 15 min;
 * - por pessoa (todos os IPs): depois de 10 erros em 24 h, espera progressiva
 *   30 s, 1, 2, 4… até 15 min a cada novo erro.
 * - por IP (qualquer pessoa ou usuário digitado): 20 erros em 15 min → 15 min. Freia quem
 *   tenta muitos usuários diferentes pela página principal (DECISOES §29).
 */
const IP_WINDOW_MS = 15 * 60_000;
const USER_WINDOW_MS = 24 * 3600_000;
const SHORT_BLOCK_MS = 15_000;
const LONG_BLOCK_MS = 15 * 60_000;
const USER_THRESHOLD = 10;
const IP_ONLY_THRESHOLD = 20;

const ipKey = (userId: string, ip: string) => `pin:${userId}:${ip}`;
const userKey = (userId: string) => `pin-user:${userId}`;
const ipOnlyKey = (ip: string) => `pin-ip:${ip}`;

/** Soma 1 ao contador (recomeçando se a janela passou) e devolve o novo total. */
async function bump(db: Db, key: string, windowMs: number, now: Date): Promise<number> {
  const nowP = sql`${now.toISOString()}::timestamptz`;
  const limit = sql`${new Date(now.getTime() - windowMs).toISOString()}::timestamptz`;
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits as r (key, count, window_start) values (${key}, 1, ${nowP})
    on conflict (key) do update set
      count = case when r.window_start < ${limit} then 1 else r.count + 1 end,
      window_start = case when r.window_start < ${limit} then ${nowP} else r.window_start end
    returning count
  `);
  return Number(res.rows[0]!.count);
}

async function setBlock(db: Db, key: string, until: Date) {
  await db.update(rateLimits).set({ blockedUntil: until }).where(eq(rateLimits.key, key));
}

/** Segundos de espera antes de poder tentar de novo (0 = livre). */
export async function pinRetryAfter(
  db: Db,
  userId: string,
  ip: string,
  now = new Date(),
): Promise<number> {
  const rows = await db
    .select({ blockedUntil: rateLimits.blockedUntil })
    .from(rateLimits)
    .where(sql`${rateLimits.key} in (${ipKey(userId, ip)}, ${userKey(userId)}, ${ipOnlyKey(ip)})`);
  const until = Math.max(0, ...rows.map((r) => r.blockedUntil?.getTime() ?? 0));
  return until > now.getTime() ? Math.ceil((until - now.getTime()) / 1000) : 0;
}

/**
 * Registra um PIN errado. Retorna a espera imposta (s) e quantas tentativas
 * restam até a próxima espera curta.
 */
export async function registerPinFailure(
  db: Db,
  userId: string,
  ip: string,
  now = new Date(),
): Promise<{ retryAfter: number; attemptsLeft: number }> {
  const ipCount = await bump(db, ipKey(userId, ip), IP_WINDOW_MS, now);
  const userCount = await bump(db, userKey(userId), USER_WINDOW_MS, now);
  const ipOnlyCount = await bump(db, ipOnlyKey(ip), IP_WINDOW_MS, now);

  let blockMs = 0;
  if (ipCount >= 5) blockMs = LONG_BLOCK_MS;
  else if (ipCount % 3 === 0) blockMs = SHORT_BLOCK_MS;
  if (blockMs) await setBlock(db, ipKey(userId, ip), new Date(now.getTime() + blockMs));
  if (ipOnlyCount >= IP_ONLY_THRESHOLD) {
    await setBlock(db, ipOnlyKey(ip), new Date(now.getTime() + LONG_BLOCK_MS));
    blockMs = LONG_BLOCK_MS;
  }

  if (userCount >= USER_THRESHOLD) {
    const progressive = Math.min(30_000 * 2 ** (userCount - USER_THRESHOLD), LONG_BLOCK_MS);
    await setBlock(db, userKey(userId), new Date(now.getTime() + progressive));
    blockMs = Math.max(blockMs, progressive);
  }

  return { retryAfter: Math.ceil(blockMs / 1000), attemptsLeft: blockMs ? 0 : 3 - (ipCount % 3) };
}

/**
 * PIN certo: zera o contador deste IP e tira a espera por pessoa. A contagem de 24 h
 * por pessoa fica, para o aviso no painel do admin continuar visível.
 */
export async function registerPinSuccess(db: Db, userId: string, ip: string) {
  await db.delete(rateLimits).where(eq(rateLimits.key, ipKey(userId, ip)));
  await db
    .update(rateLimits)
    .set({ blockedUntil: null })
    .where(eq(rateLimits.key, userKey(userId)));
}
