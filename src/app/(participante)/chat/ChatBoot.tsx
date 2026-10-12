"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { ChatPlaceholder } from "./ChatPlaceholder";

// Vale para todo o carregamento da página: navegações internas e "refresh" do
// roteador não contam como reabrir; só um carregamento completo zera isto.
let bootPromise: Promise<{ locked: boolean; slug: string }> | null = null;

export function ChatBoot({ name, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bootPromise ??= api<{ locked: boolean; slug: string }>("/api/session/boot");
    let alive = true;
    bootPromise
      .then((r) => {
        if (!alive) return;
        // Até a tela de bloqueio existir (Etapa 8), sessão bloqueada volta para o PIN.
        if (r.locked) router.replace(`/u/${r.slug}`);
        else setReady(true);
      })
      .catch((e: unknown) => {
        bootPromise = null;
        if (alive)
          router.replace(e instanceof ApiError && e.code === "REVOKED" ? `/u/${slug}` : "/");
      });
    return () => {
      alive = false;
    };
  }, [router, slug]);

  return <ChatPlaceholder name={name} ready={ready} />;
}
