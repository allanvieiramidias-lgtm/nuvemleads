"use client";

import { FileIcon, PaperPlaneRightIcon, VideoCameraIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extLabel, formatBytes, formatDuration } from "@/lib/format";
import { createBlobUrl, revokeBlobUrl } from "./blob-urls";
import type { AttachKind } from "./upload-queue";

export type Draft = { file: File; kind: AttachKind };

const TITLE: Record<AttachKind, string> = {
  IMAGE: "Enviar imagem",
  VIDEO: "Enviar vídeo",
  AUDIO: "Enviar áudio",
  FILE: "Enviar arquivo",
};

/** README §4.3 — Preview antes de enviar (modal de 480px). */
export function DraftPreview({
  draft,
  onCancel,
  onSend,
}: {
  draft: Draft | null;
  onCancel: () => void;
  onSend: (caption: string, durationSec: number | null) => void;
}) {
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!draft || draft.kind === "FILE") return;
    const u = createBlobUrl(draft.file);
    // a prévia é um recurso externo (blob:): sincroniza ao abrir e revoga ao fechar
    queueMicrotask(() => setUrl(u));
    return () => {
      revokeBlobUrl(u);
      setUrl(null);
    };
  }, [draft]);

  if (!draft) return null;
  const canCaption = draft.kind === "IMAGE" || draft.kind === "VIDEO";

  return (
    <Modal
      open
      width={480}
      closeButton
      onOpenChange={(o) => {
        if (!o) {
          setCaption("");
          onCancel();
        }
      }}
      title={TITLE[draft.kind]}
      actions={
        <>
          <Button
            onClick={() => {
              setCaption("");
              onCancel();
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<PaperPlaneRightIcon size={15} weight="fill" aria-hidden />}
            onClick={() => {
              const c = caption;
              setCaption("");
              onSend(c, duration);
            }}
          >
            Enviar
          </Button>
        </>
      }
    >
      {draft.kind === "IMAGE" && url ? (
        <div className="nl-draft-media">
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
          <img src={url} alt="Prévia da imagem" />
        </div>
      ) : null}
      {draft.kind === "VIDEO" && url ? (
        <div className="nl-draft-media relative">
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(Math.round(e.currentTarget.duration) || null)}
          />
          {duration ? (
            <span className="nl-dur-chip">
              <VideoCameraIcon size={12} aria-hidden />
              {formatDuration(duration)}
            </span>
          ) : null}
        </div>
      ) : null}
      {draft.kind === "FILE" ? (
        <div className="nl-file rounded-[var(--radius-md)] bg-[var(--color-bg)]">
          <div className="nl-file-icon" aria-hidden>
            <FileIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="nl-file-name">{draft.file.name}</div>
            <div className="nl-file-meta">
              {extLabel(draft.file.name)} · {formatBytes(draft.file.size)}
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 text-[12.5px] text-[var(--color-neutral-400)]">
        <span className="min-w-0 truncate">{draft.file.name}</span>
        <span className="flex-none">{formatBytes(draft.file.size)}</span>
      </div>
      {canCaption ? (
        <input
          className="input"
          placeholder="Adicionar legenda…"
          aria-label="Legenda"
          value={caption}
          maxLength={4000}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const c = caption;
              setCaption("");
              onSend(c, duration);
            }
          }}
        />
      ) : null}
    </Modal>
  );
}
