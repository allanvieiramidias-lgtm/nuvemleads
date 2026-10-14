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
});
export type SettingsInput = Required<z.infer<typeof SettingsSchema>>;

const DEFAULTS: SettingsInput = {
  autoLockMinutes: 5,
  lockOnTabLeave: true,
  lockOnReopen: true,
  unreadNotice: true,
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
  };
}

export async function updateSettings(
  db: Db,
  input: z.infer<typeof SettingsSchema>,
): Promise<SettingsInput> {
  const parsed = SettingsSchema.parse(input);
  const values: SettingsInput = {
    ...parsed,
    unreadNotice: parsed.unreadNotice ?? (await getSettings(db)).unreadNotice,
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
