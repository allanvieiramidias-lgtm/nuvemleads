import type { Metadata } from "next";
import { db } from "@/db";
import { userDto } from "@/lib/admin-api";
import { formatDayTime } from "@/lib/time";
import { listUsers } from "@/server/users";
import { UsersList } from "./UsersList";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ destaque?: string }>;
}) {
  const { destaque } = await searchParams;
  const users = (await listUsers(db)).map((u) => ({
    ...userDto(u),
    lastActivityLabel: u.lastActiveAt ? formatDayTime(u.lastActiveAt) : "Ainda não acessou",
  }));
  return <UsersList users={users} highlightId={destaque ?? null} />;
}
