import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { purgePreview } from "@/server/media-lifecycle";
import { PurgeBody, purgeInput } from "../schema";

/** POST { before, kinds } → { count, bytes } do que seria apagado (nada é apagado aqui). */
export const POST = adminRoute(async (req) =>
  json(await purgePreview(db, purgeInput(await readJson(req, PurgeBody)))),
);
