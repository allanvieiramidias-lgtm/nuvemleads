import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAuthScreen } from "@/components/admin/AdminAuthScreen";
import { getCurrentAdmin } from "@/lib/auth/admin-session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "NuvemLeads" };

export default async function AdminLoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  return (
    <AdminAuthScreen>
      <LoginForm />
    </AdminAuthScreen>
  );
}
