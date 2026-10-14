import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { settings, type Settings } from "@/db/schema";
import { emit } from "./events";

export const SettingsSchema = z.object({
  autoLockMinutes: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30)]),
  lockOnTabLeave: z.boolean(),
  lockOnReopen: z.boolean(),
  /** DECISOES §29. Opcional no envio: se faltar, mantém o valor atual. */
  unreadNotice: z.boolean().optional(),
  /** DECISOES §30. Apagar mídias com mais de N dias (0 = nunca). Opcional como o anterior. */
  mediaRetentionDays: z
    .union([z.literal(0), z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
    .optional(),
});
export type SettingsInput = Required<z.infer<typeof SettingsSchema>>;

const DEFAULTS: SettingsInput = {
  autoLockMinutes: 5,
  lockOnTabLeave: true,
  lockOnReopen: true,
  unreadNotice: true,
  mediaRetentionDays: 0,
};

export async function getSettings(db: Db): Promise<SettingsInput> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row ? pick(row) : DEFAULTS;
}

function pick(row: Settings): SettingsInput {
  return {
    autoLockMinutes: row.autoLockMinutes as SettingsInput["autoLockMinutes"],
    lockOnTabLeave: row.lockOnTabLeave,
    lockOnReopen: row.lockOnReopen,
    unreadNotice: row.unreadNotice,
    mediaRetentionDays: row.mediaRetentionDays as SettingsInput["mediaRetentionDays"],
  };
}

export async function updateSettings(
  db: Db,
  input: z.infer<typeof SettingsSchema>,
): Promise<SettingsInput> {
  const parsed = SettingsSchema.parse(input);
  const current = await getSettings(db);
  const values: SettingsInput = {
    ...parsed,
    unreadNotice: parsed.unreadNotice ?? current.unreadNotice,
    mediaRetentionDays: parsed.mediaRetentionDays ?? current.mediaRetentionDays,
  };
  const [row] = await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: settings.id, set: values })
    .returning();
  const result = pick(row!);
  emit("settings:updated", result);
  return result;
}
