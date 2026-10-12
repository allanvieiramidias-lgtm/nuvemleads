import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

/** Fundo e topo comuns às telas de acesso, PIN e bloqueio (README §4.1). */
export function GateScreen({
  children,
  footer,
  width = 360,
  gap = 20,
}: {
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  gap?: number;
}) {
  return (
    <div className="nl-gate">
      <header className="nl-gate-top">
        <Logo size={28} fontSize={17} />
      </header>
      <main className="nl-gate-center">
        <div className="nl-gate-col" style={{ maxWidth: width, gap }}>
          {children}
        </div>
      </main>
      {footer ? <footer className="nl-gate-foot">{footer}</footer> : null}
    </div>
  );
}
