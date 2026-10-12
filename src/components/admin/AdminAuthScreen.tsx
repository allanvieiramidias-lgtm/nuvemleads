import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";

/** Fundo e cabeçalho comuns ao login, "Esqueci minha senha" e redefinição (README §4.5). */
export function AdminAuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="nl-admin-ground">
      <div className="nl-auth-form">
        <div className="mb-2.5 flex items-center gap-2.5">
          <Logo size={30} fontSize={18} />
          <Badge variant="neutral" className="ml-1">
            Admin
          </Badge>
        </div>
        {children}
      </div>
    </main>
  );
}
