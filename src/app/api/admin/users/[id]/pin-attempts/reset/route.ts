import { db } from "@/db";
import { adminRoute, isUuid } from "@/lib/admin-api";
import { apiError, json } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { resetPinAttempts } from "@/server/dashboard";

/** "Liberar tentativas" (DECISOES §8). */
export const POST = adminRoute<{ id: string }>(async (_req, { admin, params }) => {
  if (!isUuid(params.id)) return apiError("NOT_FOUND", "Usuário não encontrado.");
  await resetPinAttempts(db, params.id);
  await logAdminEvent(db, admin.id, "PIN_ATTEMPTS_RESET", params.id);
  return json({ ok: true });
});
