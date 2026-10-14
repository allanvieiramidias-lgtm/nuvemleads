// Depois do fluxo do admin: deixa exatamente Maria e Allan ativos, com PINs conhecidos,
// para os testes do participante. Grava os links em .data/e2e-state.json.
import { mkdir, writeFile } from "node:fs/promises";
import { hash } from "@node-rs/argon2";
import { test as setup } from "@playwright/test";
import { Pool } from "pg";
import { E2E, PARTICIPANTS, STATE_FILE } from "./env";

setup("preparar Maria e Allan", async () => {
  const pool = new Pool({ connectionString: E2E.databaseUrl });
  await pool.query(
    "truncate table messages, attachments, conversations, user_sessions, users, rate_limits restart identity cascade",
  );
  await pool.query(
    "update settings set auto_lock_minutes = 5, lock_on_tab_leave = true, lock_on_reopen = true, unread_notice = true",
  );
  const out: Record<string, string> = {};
  for (const p of PARTICIPANTS) {
    const slug = `${p.key}e2e${Math.random().toString(36).slice(2, 10)}`.slice(0, 16);
    await pool.query(
      "insert into users (name, username, tone, slug, pin_hash, pin_notice_seen) values ($1, $2, $3, $4, $5, $6)",
      [p.name, p.username, p.tone, slug, await hash(p.pin), !p.pinChangedNotice],
    );
    out[p.key] = slug;
  }
  await pool.end();
  await mkdir(".data", { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(out));
});
