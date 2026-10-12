import type { Metadata } from "next";
import { UserForm } from "@/components/admin/UserForm";
import { db } from "@/db";
import { getAppUrl } from "@/lib/app-url";
import { countActive, defaultStatusForNewUser } from "@/server/users";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

export default async function NovoUsuarioPage() {
  return (
    <UserForm
      mode="create"
      appUrl={await getAppUrl()}
      othersActive={await countActive(db)}
      defaultStatus={await defaultStatusForNewUser(db)}
    />
  );
}
