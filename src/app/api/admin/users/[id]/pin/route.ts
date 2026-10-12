import { z } from "zod";
import { db } from "@/db";
import { adminRoute, isUuid, userDto } from "@/lib/admin-api";
import { apiError, json, readJson } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { changeUserPin } from "@/server/users";

const Body = z.object({ pin: z.string().max(20) });

/** Novo PIN: pinVersion++ e sessões da pessoa encerradas (ARQUITETURA §5). */
export const POST = adminRoute<{ id: string }>(async (req, { admin, params }) => {
  if (!isUuid(params.id)) return apiError("NOT_FOUND", "Usuário não encontrado.");
  const { pin } = await readJson(req, Body);
  const user = await changeUserPin(db, params.id, pin);
  await logAdminEvent(db, admin.id, "PIN_CHANGED", params.id);
  return json({ user: userDto(user) });
});
