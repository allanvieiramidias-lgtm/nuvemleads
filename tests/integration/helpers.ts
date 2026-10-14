import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Limpa todas as tabelas entre testes (o banco de testes é descartável). */
export async function resetDb() {
  await db.execute(sql`
    truncate table messages, attachments, conversations, user_sessions, users,
      admin_events, admin_sessions, password_resets, admins, rate_limits, settings, trusted_devices
    restart identity cascade
  `);
}
