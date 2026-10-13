"use client";

/**
 * Seletor de arquivo / câmera aberto (DECISOES §4). A Etapa 8 (LockController) escuta
 * estes avisos para suspender o bloqueio — com véu de privacidade — enquanto a pessoa escolhe.
 */
type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let openCount = 0;

export function onPickerChange(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isPickerOpen() {
  return openCount > 0;
}

/** Abre um <input type="file"> avisando o bloqueio; avisa de novo ao escolher, cancelar ou voltar o foco. */
export function openPicker(input: HTMLInputElement) {
  openCount++;
  listeners.forEach((l) => l(true));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openCount = Math.max(0, openCount - 1);
    listeners.forEach((l) => l(false));
    input.removeEventListener("change", close);
    input.removeEventListener("cancel", close);
    window.removeEventListener("focus", onFocus);
  };
  // o "focus" da janela chega antes do "change" em alguns navegadores: espera um pouco
  const onFocus = () => setTimeout(close, 1000);
  input.addEventListener("change", close);
  input.addEventListener("cancel", close);
  window.addEventListener("focus", onFocus);
  input.click();
}

/** Suspende o bloqueio enquanto uma promessa roda (ex.: pedido de permissão do microfone). */
export async function guard<T>(p: () => Promise<T>): Promise<T> {
  openCount++;
  listeners.forEach((l) => l(true));
  try {
    return await p();
  } finally {
    openCount = Math.max(0, openCount - 1);
    listeners.forEach((l) => l(false));
  }
}
