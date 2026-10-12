// Banco próprio dos testes no navegador: recriado e semeado a cada execução.
import { rm } from "node:fs/promises";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { E2E } from "./env";

export default async function setup() {
  const url = new URL(E2E.databaseUrl);
  const dbName = url.pathname.slice(1);
  const admin = new Client({
    connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
  });
  await admin.connect();
  const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
  if (!rowCount) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const pool = new Pool({ connectionString: E2E.databaseUrl });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.query(`truncate table messages, attachments, conversations, user_sessions, users,
    admin_events, admin_sessions, password_resets, admins, rate_limits, settings restart identity cascade`);
  await pool.query("insert into settings (id) values (1)");
  const passwordHash = await hash(E2E.adminPassword);
  // um admin para login e um por projeto para o fluxo de redefinir senha (que troca a senha)
  for (const [name, email] of [
    ["Renata Alves", E2E.adminEmail],
    ["Reset Desktop", "reset-desktop@e2e.test"],
    ["Reset Mobile", "reset-mobile@e2e.test"],
    ["Paula Painel", "painel@e2e.test"],
  ]) {
    await pool.query("insert into admins (name, email, password_hash) values ($1, $2, $3)", [
      name,
      email,
      passwordHash,
    ]);
  }
  await pool.end();
  await rm(E2E.outbox, { recursive: true, force: true });
}
