import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema> & { $client: Pool };

// Singleton no globalThis: evita várias conexões no hot reload do dev e é compartilhado
// entre o código do Next e o servidor customizado (server.ts) no mesmo processo.
const g = globalThis as unknown as { nlPool?: Pool; nlDb?: DB };

/**
 * Conecta só no primeiro uso. Assim a ordem de carregamento dos módulos não importa
 * (o .env pode ser lido depois que este arquivo é importado).
 */
function getDb(): DB {
  if (g.nlDb) return g.nlDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  g.nlPool = new Pool({ connectionString, max: 10 });
  g.nlDb = drizzle(g.nlPool, { schema, casing: "snake_case" }) as DB;
  return g.nlDb;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    getDb();
    const real = g.nlPool!;
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export type Db = DB;
