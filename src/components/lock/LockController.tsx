"use client";

import { useEffect, useRef } from "react";
import { isPickerOpen, onPickerChange } from "./picker-guard";
import { type LockReason, useLock, veilOff, veilOn } from "./lock-store";

const BLUR_GRACE_MS = 1500;
const PICKER_MAX_MS = 3 * 60_000;
const HEARTBEAT_MS = 30_000;
const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

export type LockSource = "local" | "broadcast" | "server";

/**
 * README §5 (tabela de gatilhos) + ARQUITETURA §7 + DECISOES §4–§6:
 * troca de aba, perda de foco (tolerância 1,5 s), inatividade, outras abas, servidor.
 * Só fica ativo com a conversa desbloqueada.
 */
export function LockController({
  active,
  onLock,
  onRevoked,
  onTakeover,
  tabId,
}: {
  active: boolean;
  onLock: (reason: LockReason, source: LockSource) => void;
  onRevoked: () => void;
  onTakeover: () => void;
  tabId: string;
}) {
  const settings = useLock((s) => s.settings);
  const handlers = useRef({ onLock, onRevoked, onTakeover });
  useEffect(() => {
    handlers.current = { onLock, onRevoked, onTakeover };
  });

  // Outras abas da mesma pessoa (BroadcastChannel): bloqueio vale para todas; "assumir" a conversa.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("nuvemleads");
    ch.onmessage = (e: MessageEvent<{ type: string; reason?: LockReason; tab?: string }>) => {
      if (e.data?.type === "lock" && e.data.reason)
        handlers.current.onLock(e.data.reason, "broadcast");
      if (e.data?.type === "active" && e.data.tab !== tabId) handlers.current.onTakeover();
    };
    return () => ch.close();
  }, [tabId]);

  useEffect(() => {
    if (!active) return;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    let pickerTimer: ReturnType<typeof setTimeout> | null = null;
    let lastActivity = Date.now();
    let activeSinceBeat = false;
    const lock = (r: LockReason) => {
      veilOn();
      handlers.current.onLock(r, "local");
    };

    // ── seletor de arquivo/câmera: suspende o bloqueio, com véu, por até 3 min ──
    const offPicker = onPickerChange((open) => {
      if (pickerTimer) clearTimeout(pickerTimer);
      if (open) {
        pickerTimer = setTimeout(() => {
          if (document.visibilityState === "hidden" || !document.hasFocus()) lock("TAB");
        }, PICKER_MAX_MS);
      } else if (document.visibilityState === "visible") {
        veilOff();
        lastActivity = Date.now();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!settings.lockOnTabLeave) return;
        veilOn();
        if (!isPickerOpen()) lock("TAB");
      } else if (isPickerOpen()) {
        veilOff(); // voltou com o arquivo escolhido
      }
    };
    const onBlur = () => {
      if (!settings.lockOnTabLeave) return;
      veilOn();
      if (isPickerOpen()) return;
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) lock("BLUR");
      }, BLUR_GRACE_MS);
    };
    const onFocus = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = null;
      veilOff();
    };
    // Fechar, recarregar ou sair da página: o bloqueio só será visto quando ela for reaberta.
    // Respeita "Exigir PIN ao reabrir" (DECISOES §7): desligado, a sessão volta desbloqueada.
    const onPageHide = () => {
      if (settings.lockOnReopen) lock("REOPEN");
    };
    const onActivity = () => {
      lastActivity = Date.now();
      activeSinceBeat = true;
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    ACTIVITY.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    // ── inatividade (cliente) ──
    const idleTimer = setInterval(() => {
      if (Date.now() - lastActivity > settings.autoLockMinutes * 60_000) lock("IDLE");
    }, 1000);

    // ── batimento (servidor também bloqueia por inatividade) ──
    const beat = setInterval(async () => {
      const activeNow = activeSinceBeat;
      activeSinceBeat = false;
      try {
        const res = await fetch("/api/session/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ active: activeNow }),
        });
        if (res.status === 423) {
          const data = (await res.json().catch(() => null)) as {
            error?: { fields?: { reason?: LockReason } };
          } | null;
          veilOn();
          handlers.current.onLock(data?.error?.fields?.reason ?? "IDLE", "server");
        } else if (res.status === 401) handlers.current.onRevoked();
      } catch {
        /* sem conexão: tenta no próximo */
      }
    }, HEARTBEAT_MS);

    return () => {
      offPicker();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      ACTIVITY.forEach((ev) => window.removeEventListener(ev, onActivity));
      if (blurTimer) clearTimeout(blurTimer);
      if (pickerTimer) clearTimeout(pickerTimer);
      clearInterval(idleTimer);
      clearInterval(beat);
    };
  }, [active, settings.autoLockMinutes, settings.lockOnTabLeave, settings.lockOnReopen]);

  return null;
}

/** Avisa as outras abas (bloqueio vale para todas; esta aba assumiu a conversa). */
export function broadcast(
  msg: { type: "lock"; reason: LockReason } | { type: "active"; tab: string },
) {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel("nuvemleads");
  ch.postMessage(msg);
  ch.close();
}
