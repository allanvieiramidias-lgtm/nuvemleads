"use client";

import { useEffect, useState } from "react";

const POLL_MS = 30_000;

/**
 * "Você tem novas mensagens" (DECISOES §29). Pergunta ao servidor só "sim ou não", ao abrir,
 * a cada 30 s e quando a aba volta a ficar visível. Nada de quantas, de quem nem do quê.
 */
export function UnreadNotice() {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notice", { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: boolean };
        if (alive) setUnread(!!data.unread);
      } catch {
        /* sem rede: mantém o último estado */
      }
    };
    void check();
    const t = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  // A região de aviso fica sempre na página (vazia) para o leitor de tela anunciar quando aparecer.
  return (
    <div role="status" aria-live="polite" className="nl-unread-region">
      {unread ? (
        <p className="nl-unread">
          <span className="nl-unread-dot" aria-hidden />
          Você tem novas mensagens
        </p>
      ) : null}
    </div>
  );
}
