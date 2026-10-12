import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json } from "@/lib/http";
import { updateAccount } from "@/server/admin-account";
import { logAdminEvent } from "@/server/audit";

export const PATCH = adminRoute(async (req, { admin }) => {
  const account = await updateAccount(db, admin.id, await req.json().catch(() => null));
  await logAdminEvent(db, admin.id, "ACCOUNT_UPDATED");
  return json({ account });
});
