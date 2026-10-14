import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { purgeMedia } from "@/server/media-lifecycle";
import { PurgeBody, purgeInput } from "../schema";

/** POST { before, kinds } → apaga de verdade e devolve { count, bytes } (DECISOES §30). */
export const POST = adminRoute(async (req, { admin }) => {
  const result = await purgeMedia(db, purgeInput(await readJson(req, PurgeBody)));
  await logAdminEvent(db, admin.id, "MEDIA_PURGED");
  return json(result);
});
