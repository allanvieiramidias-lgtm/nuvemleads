"use client";

import { CircleNotchIcon, SignOutIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-client";

/** Provisório da Etapa 5: esqueleto de carregamento (README §4.3). A conversa real chega na Etapa 6. */
export function ChatPlaceholder({ name, ready }: { name: string; ready: boolean }) {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="flex items-center gap-3 px-5 py-2.5"
        style={{ background: "var(--nl-rule) no-repeat bottom / 100% 1px" }}
      >
        <Logo size={24} fontSize={15} />
        <span className="flex-1" />
        <span className="text-[13px] text-[var(--color-neutral-400)]">{name}</span>
        <Button
          icon={<SignOutIcon size={15} aria-hidden />}
          onClick={async () => {
            await api("/api/auth/logout").catch(() => null);
            router.replace("/");
            router.refresh();
          }}
        >
          Encerrar sessão
        </Button>
      </header>
      <main
        className="mx-auto flex w-full max-w-[780px] flex-1 flex-col gap-2 px-6 py-4"
        aria-busy={!ready}
      >
        {[55, 35, 45, 60, 30].map((w, i) => (
          <div
            key={i}
            className={i % 2 ? "self-end" : ""}
            style={{
              width: `${w}%`,
              height: 30,
              borderRadius: 14,
              background: i % 2 ? "var(--color-accent-900)" : "var(--color-surface)",
              animation: `nl-shimmer 1.2s ${i * 0.1}s infinite`,
            }}
          />
        ))}
        <div className="mt-auto flex items-center gap-1.5 text-[12px] text-[var(--color-neutral-500)]">
          <CircleNotchIcon size={14} className="nl-spin" aria-hidden />
          Carregando conversa…
        </div>
      </main>
    </div>
  );
}
