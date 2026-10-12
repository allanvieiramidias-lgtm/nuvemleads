import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getAdminByToken, type AdminProfile } from "@/server/admin-auth";
import { ADMIN_COOKIE } from "./cookies";

/** Admin da requisição atual (Server Components e Route Handlers). */
export async function getCurrentAdmin(): Promise<AdminProfile | null> {
  const store = await cookies();
  return getAdminByToken(db, store.get(ADMIN_COOKIE)?.value);
}

/** Para páginas do painel: sem sessão válida → /admin/login. */
export async function requireAdmin(): Promise<AdminProfile> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
