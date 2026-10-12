import { z } from "zod";
import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { changeAdminPassword } from "@/server/admin-account";
import { logAdminEvent } from "@/server/audit";

const Body = z.object({ current: z.string().max(200), next: z.string().max(200) });

/** Mín. 10 caracteres; encerra as outras sessões de admin (ARQUITETURA §5). */
export const POST = adminRoute(async (req, { admin, token }) => {
  await changeAdminPassword(db, admin.id, await readJson(req, Body), token);
  await logAdminEvent(db, admin.id, "PASSWORD_CHANGED");
  return json({ ok: true });
});
