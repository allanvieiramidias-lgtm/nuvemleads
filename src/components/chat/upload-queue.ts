"use client";

import { createBlobUrl, revokeBlobUrl } from "./blob-urls";
import { useChat } from "./store";
import type { MessageDto } from "./types";

export type AttachKind = "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
type Hint = "media" | "audio" | "file";
type Draft = {
  file: File;
  kind: AttachKind;
  hint: Hint;
  caption: string;
  viewOnce: boolean;
  durationSec: number | null;
};

/** O arquivo fica na memória até sair da tela ou bloquear, para "Tentar novamente" (ARQUITETURA §9). */
const drafts = new Map<string, Draft>();
const xhrs = new Map<string, XMLHttpRequest>();
const DONE_MS = 900;

type UploadResult = { attachmentId: string; kind: AttachKind };

function uploadWithProgress(clientId: string, d: Draft): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.set(clientId, xhr);
    xhr.open("POST", "/api/uploads");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      useChat.getState().setUpload(clientId, {
        state: "uploading",
        progress: Math.min(99, Math.round((e.loaded / e.total) * 100)),
      });
    };
    xhr.onload = () => {
      xhrs.delete(clientId);
      let data: (UploadResult & { error?: { message: string } }) | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* resposta inválida */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.attachmentId) resolve(data);
      else reject(new Error(data?.error?.message ?? "upload"));
    };
    xhr.onerror = () => {
      xhrs.delete(clientId);
      reject(new Error("network"));
    };
    xhr.onabort = () => {
      xhrs.delete(clientId);
      reject(new Error("abort"));
    };
    const fd = new FormData();
    fd.append("kind", d.hint);
    fd.append("file", d.file, d.file.name);
    xhr.send(fd);
  });
}

async function run(clientId: string, onError: (message: string) => void) {
  const d = drafts.get(clientId);
  if (!d) return;
  const chat = useChat.getState();
  chat.setLocalStatus(clientId, "sending");
  chat.setUpload(clientId, { state: "preparing", progress: 0 });
  try {
    const up = await uploadWithProgress(clientId, d);
    useChat.getState().setUpload(clientId, { state: "uploading", progress: 100 });
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        clientId,
        kind: up.kind,
        attachmentId: up.attachmentId,
        caption: d.caption || undefined,
        viewOnce: d.viewOnce || undefined,
      }),
    });
    const data = (await res.json().catch(() => null)) as { message?: MessageDto } | null;
    if (!res.ok || !data?.message) throw new Error("message");
    useChat.getState().upsert(data.message);
    useChat.getState().setUpload(clientId, { state: "done", progress: 100 });
    drafts.delete(clientId);
    setTimeout(() => useChat.getState().setUpload(clientId, undefined), DONE_MS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "abort") return;
    useChat.getState().setUpload(clientId, { state: "error", progress: 0 });
    useChat.getState().setLocalStatus(clientId, "failed");
    // erros de validação do servidor (tamanho, formato) também viram aviso
    if (msg && !["network", "upload", "message"].includes(msg)) onError(msg);
  }
}

/** Mensagem otimista com prévia local + envio com progresso (README §4.3, ARQUITETURA §9). */
export function sendAttachment(
  input: {
    file: File;
    kind: AttachKind;
    hint: Hint;
    caption?: string;
    durationSec?: number | null;
    viewOnce?: boolean;
  },
  senderId: string,
  onError: (message: string) => void,
) {
  const clientId = crypto.randomUUID();
  const previewUrl = input.kind === "FILE" ? undefined : createBlobUrl(input.file);
  const d: Draft = {
    file: input.file,
    kind: input.kind,
    hint: input.hint,
    caption: (input.caption ?? "").trim(),
    durationSec: input.durationSec ?? null,
    viewOnce: !!input.viewOnce,
  };
  drafts.set(clientId, d);
  useChat.getState().addOptimistic({
    id: null,
    clientId,
    senderId,
    kind: input.kind,
    body: input.kind === "IMAGE" || input.kind === "VIDEO" ? d.caption || null : null,
    attachment: {
      id: "local",
      kind: input.kind,
      mime: input.file.type,
      sizeBytes: input.file.size,
      name: input.file.name,
      width: null,
      height: null,
      durationSec: d.durationSec,
      status: "READY",
      hasThumb: false,
    },
    createdAt: new Date().toISOString(),
    status: "sending",
    viewOnce: d.viewOnce,
    opened: false,
    expired: false,
    local: { previewUrl, upload: { state: "preparing", progress: 0 } },
  });
  void run(clientId, onError);
}

export function retryAttachment(clientId: string, onError: (message: string) => void) {
  void run(clientId, onError);
}

export function hasDraft(clientId: string) {
  return drafts.has(clientId);
}

/** Ao bloquear/sair: cancela envios e esquece os arquivos. */
export function clearUploads() {
  for (const x of xhrs.values()) x.abort();
  xhrs.clear();
  for (const id of drafts.keys()) {
    const m = useChat.getState().messages.find((x) => x.clientId === id);
    revokeBlobUrl(m?.local?.previewUrl);
  }
  drafts.clear();
}
