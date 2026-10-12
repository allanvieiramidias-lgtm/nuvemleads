import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { getSettings, SettingsSchema, updateSettings } from "@/server/settings";

export const GET = adminRoute(async () => json({ settings: await getSettings(db) }));

export const PATCH = adminRoute(async (req, { admin }) => {
  const settings = await updateSettings(db, await readJson(req, SettingsSchema));
  await logAdminEvent(db, admin.id, "SETTINGS_UPDATED");
  return json({ settings });
});
