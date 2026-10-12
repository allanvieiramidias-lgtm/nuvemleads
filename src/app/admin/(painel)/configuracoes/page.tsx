import type { Metadata } from "next";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth/admin-session";
import { formatAgo } from "@/lib/time";
import { getSettings } from "@/server/settings";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const admin = await requireAdmin();
  return (
    <SettingsForm
      initial={await getSettings(db)}
      account={{ name: admin.name, email: admin.email }}
      passwordChanged={formatAgo(admin.passwordChangedAt)}
    />
  );
}
