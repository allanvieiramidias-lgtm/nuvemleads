import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/admin-session";

// Toda página do painel exige sessão de admin válida no banco (o proxy só confere o cookie).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
