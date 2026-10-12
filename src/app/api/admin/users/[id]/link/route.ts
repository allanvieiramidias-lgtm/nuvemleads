import { db } from "@/db";
import { adminRoute, isUuid, userDto } from "@/lib/admin-api";
import { apiError, json } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { regenerateSlug } from "@/server/users";

/** "Gerar novo link": o link anterior deixa de funcionar (DECISOES §13). */
export const POST = adminRoute<{ id: string }>(async (_req, { admin, params }) => {
  if (!isUuid(params.id)) return apiError("NOT_FOUND", "Usuário não encontrado.");
  const user = await regenerateSlug(db, params.id);
  await logAdminEvent(db, admin.id, "LINK_REGENERATED", params.id);
  return json({ user: userDto(user) });
});
