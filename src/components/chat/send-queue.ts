"use client";

import { useChat } from "./store";
import type { MessageDto } from "./types";

/**
 * Envio de texto com fila offline (README §5, ARQUITETURA §8):
 * - erro de rede → continua "enviando" e tenta de novo quando a conexão volta, com o mesmo clientId;
 * - o servidor recusou (4xx/5xx) → "falhou" + "Tentar novamente".
 */
const pending = new Map<string, { body: string; viewOnce: boolean }>(); // clientId → texto
let flushing = false;

async function post(
  clientId: string,
  { body, viewOnce }: { body: string; viewOnce: boolean },
): Promise<"ok" | "network" | "rejected" | "locked"> {
  let res: Response;
  try {
    res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kind: "TEXT", body, ...(viewOnce ? { viewOnce } : {}) }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return "network";
  }
  if (res.status === 423 || res.status === 401) return "locked";
  if (!res.ok) return "rejected";
  const data = (await res.json().catch(() => null)) as { message?: MessageDto } | null;
  if (data?.message) useChat.getState().upsert(data.message);
  return "ok";
}

async function attempt(clientId: string) {
  const body = pending.get(clientId);
  if (!body) return;
  useChat.getState().setLocalStatus(clientId, "sending");
  const r = await post(clientId, body);
  if (r === "ok") pending.delete(clientId);
  else if (r === "rejected") {
    pending.delete(clientId);
    useChat.getState().setLocalStatus(clientId, "failed");
  }
  // "network" e "locked": fica na fila, "enviando"
}

export function sendText(text: string, senderId: string, viewOnce = false) {
  const clientId = crypto.randomUUID();
  useChat.getState().addOptimistic({
    id: null,
    clientId,
    senderId,
    kind: "TEXT",
    body: text,
    attachment: null,
    createdAt: new Date().toISOString(),
    status: "sending",
    viewOnce,
    opened: false,
    expired: false,
  });
  pending.set(clientId, { body: text, viewOnce });
  void attempt(clientId);
}

/** "Tentar novamente" numa mensagem que falhou. */
export function retry(clientId: string) {
  const m = useChat.getState().messages.find((x) => x.clientId === clientId);
  if (!m?.body) return;
  pending.set(clientId, { body: m.body, viewOnce: m.viewOnce });
  void attempt(clientId);
}

/** Reenvia tudo o que ficou na fila (ao reconectar). */
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    for (const clientId of [...pending.keys()]) await attempt(clientId);
  } finally {
    flushing = false;
  }
}

/** Esquece a fila (ao bloquear/sair: nada fica guardado). */
export function clearQueue() {
  pending.clear();
}
