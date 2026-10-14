import type { Db } from "@/db";
import { adminEvents } from "@/db/schema";

export type AdminAction =
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "PIN_CHANGED"
  | "LINK_REGENERATED"
  | "PIN_ATTEMPTS_RESET"
  | "SETTINGS_UPDATED"
  | "ACCOUNT_UPDATED"
  | "PASSWORD_CHANGED"
  | "MEDIA_RETENTION_UPDATED"
  | "MEDIA_PURGED";

/** Trilha de ações do admin — sem nenhum conteúdo de mensagens (ARQUITETURA §3). */
export async function logAdminEvent(
  db: Db,
  adminId: string,
  action: AdminAction,
  targetId?: string | null,
) {
  await db.insert(adminEvents).values({ adminId, action, targetId: targetId ?? null });
}
