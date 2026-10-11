// Tabelas completas chegam na Etapa 2 (ARQUITETURA §3 + DECISOES §3).
import { boolean, integer, pgTable } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  autoLockMinutes: integer("auto_lock_minutes").notNull().default(5), // 1 | 5 | 15 | 30
  lockOnTabLeave: boolean("lock_on_tab_leave").notNull().default(true),
  lockOnReopen: boolean("lock_on_reopen").notNull().default(true),
});
