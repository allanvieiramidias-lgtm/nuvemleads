import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth/admin-session";

// Toda página do painel exige sessão de admin válida no banco (o proxy só confere o cookie).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AdminShell name={admin.name} email={admin.email}>
      {children}
    </AdminShell>
  );
}
