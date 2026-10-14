import { z } from "zod";
import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { diskUsage } from "@/server/disk";
import { mediaStats } from "@/server/media-lifecycle";
import { getSettings, updateSettings } from "@/server/settings";

/** GET → uso de espaço (só números: nada de nomes, miniaturas ou conteúdo) — DECISOES §30. */
export const GET = adminRoute(async () =>
  json({
    stats: await mediaStats(db),
    disk: await diskUsage(),
    retentionDays: (await getSettings(db)).mediaRetentionDays,
  }),
);

const Body = z.object({
  retentionDays: z.union([
    z.literal(0),
    z.literal(30),
    z.literal(90),
    z.literal(180),
    z.literal(365),
  ]),
});

/** PATCH { retentionDays } → limpeza automática (0 = nunca). */
export const PATCH = adminRoute(async (req, { admin }) => {
  const { retentionDays } = await readJson(req, Body);
  const s = await getSettings(db);
  const saved = await updateSettings(db, { ...s, mediaRetentionDays: retentionDays });
  await logAdminEvent(db, admin.id, "MEDIA_RETENTION_UPDATED");
  return json({ retentionDays: saved.mediaRetentionDays });
});
