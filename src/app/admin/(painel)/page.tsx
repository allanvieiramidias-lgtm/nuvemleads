import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin-session";
import { LogoutButton } from "./LogoutButton";

export const metadata: Metadata = { title: "NuvemLeads" };

// Painel provisório da Etapa 3 — a Etapa 4 troca pela estrutura completa (README §4.6 e §4.7).
export default async function PainelPage() {
  const admin = await requireAdmin();
  const firstName = admin.name.split(/\s+/)[0];
  return (
    <main className="flex min-h-dvh max-w-[880px] flex-col gap-6 px-10 pt-8 pb-14 max-[699px]:px-3.5 max-[699px]:pt-4.5">
      <div>
        <div className="text-[12px] text-[var(--color-neutral-500)]">NuvemLeads</div>
        <h2 className="m-0 text-[28px]">Olá, {firstName}</h2>
        <p className="m-0 text-[var(--color-neutral-400)]">Resumo da sala privada.</p>
      </div>
      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
