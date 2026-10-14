import type { Metadata } from "next";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth/admin-session";
import { diskUsage } from "@/server/disk";
import { mediaStats } from "@/server/media-lifecycle";
import { getSettings } from "@/server/settings";
import { MediaPanel } from "./MediaPanel";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

/** Mídias (DECISOES §30): uso de espaço e limpeza. O admin nunca vê o conteúdo. */
export default async function MidiasPage() {
  await requireAdmin();
  return (
    <MediaPanel
      stats={await mediaStats(db)}
      disk={await diskUsage()}
      retentionDays={(await getSettings(db)).mediaRetentionDays}
    />
  );
}
