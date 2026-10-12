import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserForm } from "@/components/admin/UserForm";
import { db } from "@/db";
import { isUuid, userDto } from "@/lib/admin-api";
import { getAppUrl } from "@/lib/app-url";
import { countActive, getUser } from "@/server/users";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = isUuid(id) ? await getUser(db, id) : null;
  if (!user) notFound();
  return (
    <UserForm
      key={user.id}
      mode="edit"
      user={userDto(user)}
      appUrl={await getAppUrl()}
      othersActive={await countActive(db, user.id)}
    />
  );
}
