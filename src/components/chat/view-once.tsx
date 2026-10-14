"use client";

import {
  DownloadSimpleIcon,
  EyeSlashIcon,
  HourglassSimpleIcon,
  NumberCircleOneIcon,
} from "@phosphor-icons/react/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api-client";
import { formatBytes } from "@/lib/format";
import { useChat, type OnceView } from "./store";
import type { ChatMessage } from "./types";

/**
 * Visualização única e mídia expirada (DECISOES §30). A bolha nunca mostra o conteúdo:
 * quem recebeu toca para abrir; o conteúdo vem do servidor só nessa hora e some ao fechar.
 */
const LABEL: Record<ChatMessage["kind"], string> = {
  TEXT: "Mensagem",
  IMAGE: "Foto",
  VIDEO: "Vídeo",
  AUDIO: "Áudio",
  FILE: "Arquivo",
};

export function OnceBubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const label = LABEL[m.kind];

  if (!m.viewOnce) {
    return (
      <div className="nl-once" data-state="expired">
        <HourglassSimpleIcon size={16} aria-hidden />
        <span>Mídia expirada</span>
      </div>
    );
  }

  if (mine || m.opened || m.expired) {
    return (
      <div className="nl-once" data-state={m.opened || m.expired ? "opened" : "closed"}>
        <NumberCircleOneIcon size={16} aria-hidden />
        <span>
          {label} · visualização única
          {m.opened || m.expired ? <span className="nl-once-sub"> · Aberta</span> : null}
        </span>
      </div>
    );
  }

  async function open() {
    if (busy || !m.id) return;
    setBusy(true);
    try {
      const r = await api<{ body: string | null; attachment: OnceView["attachment"] }>(
        `/api/messages/${m.id}/open`,
      );
      useChat.getState().setOnceView({ id: m.id, kind: m.kind, ...r });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível abrir. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="nl-once nl-once-open" data-state="closed" onClick={open}>
      <NumberCircleOneIcon size={18} weight="fill" aria-hidden />
      <span>
        {label} de visualização única
        <span className="nl-once-sub">{busy ? "Abrindo…" : "Toque para ver uma vez"}</span>
      </span>
    </button>
  );
}

/** O visor: mostra uma vez e, ao fechar, pede ao servidor para apagar na hora. */
export function OnceViewer() {
  const v = useChat((s) => s.onceView);

  function close() {
    if (!v) return;
    useChat.getState().setOnceView(null);
    void fetch(`/api/messages/${v.id}/close`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => null);
  }

  if (!v) return null;
  const src = v.attachment ? `/api/media/${v.attachment.id}` : null;
  return (
    <Modal
      open
      width={v.kind === "TEXT" || v.kind === "FILE" || v.kind === "AUDIO" ? 440 : 720}
      closeButton
      onOpenChange={(o) => !o && close()}
      title={`${LABEL[v.kind]} de visualização única`}
      description={
        <span className="inline-flex items-center gap-1.5">
          <EyeSlashIcon size={14} aria-hidden />
          Some para os dois quando você fechar.
        </span>
      }
      actions={
        <Button variant="primary" onClick={close}>
          Fechar
        </Button>
      }
    >
      <div className="nl-once-view" onContextMenu={(e) => e.preventDefault()}>
        {v.kind === "TEXT" ? <p className="nl-once-text">{v.body}</p> : null}
        {v.kind === "IMAGE" && src ? (
          // eslint-disable-next-line @next/next/no-img-element -- mídia privada por rota autenticada
          <img src={src} alt="Foto de visualização única" draggable={false} />
        ) : null}
        {v.kind === "VIDEO" && src ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
          />
        ) : null}
        {v.kind === "AUDIO" && src ? (
          <audio src={src} controls autoPlay controlsList="nodownload" />
        ) : null}
        {v.kind === "FILE" && v.attachment ? (
          <div className="nl-file rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <div className="min-w-0 flex-1">
              <div className="nl-file-name">{v.attachment.name}</div>
              <div className="nl-file-meta">{formatBytes(v.attachment.sizeBytes)}</div>
            </div>
            <a
              className="btn btn-secondary no-underline"
              href={`/api/media/${v.attachment.id}/download`}
              download={v.attachment.name}
            >
              <DownloadSimpleIcon size={15} aria-hidden />
              Baixar
            </a>
          </div>
        ) : null}
        {v.kind !== "TEXT" && v.body ? <p className="nl-once-caption">{v.body}</p> : null}
      </div>
    </Modal>
  );
}
