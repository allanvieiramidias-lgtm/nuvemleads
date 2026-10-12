import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { settings, type Settings } from "@/db/schema";
import { emit } from "./events";

export const SettingsSchema = z.object({
  autoLockMinutes: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30)]),
  lockOnTabLeave: z.boolean(),
  lockOnReopen: z.boolean(),
});
export type SettingsInput = z.infer<typeof SettingsSchema>;

const DEFAULTS: SettingsInput = { autoLockMinutes: 5, lockOnTabLeave: true, lockOnReopen: true };

export async function getSettings(db: Db): Promise<SettingsInput> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row ? pick(row) : DEFAULTS;
}

function pick(row: Settings): SettingsInput {
  return {
    autoLockMinutes: row.autoLockMinutes as SettingsInput["autoLockMinutes"],
    lockOnTabLeave: row.lockOnTabLeave,
    lockOnReopen: row.lockOnReopen,
  };
}

export async function updateSettings(db: Db, input: SettingsInput): Promise<SettingsInput> {
  const values = SettingsSchema.parse(input);
  const [row] = await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: settings.id, set: values })
    .returning();
  const result = pick(row!);
  emit("settings:updated", result);
  return result;
}
