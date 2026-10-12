// Banco de testes separado: cria (se faltar) e aplica as migrações antes dos testes de integração.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://nuvem:nuvem-dev@localhost:5432/nuvemleads_test";

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const admin = new Client({
    connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
  });
  await admin.connect();
  const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
  if (!rowCount) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
