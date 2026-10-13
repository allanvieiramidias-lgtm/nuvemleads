"use client";

import {
  CheckIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  FileCsvIcon,
  FileDocIcon,
  FileIcon,
  FilePdfIcon,
  FileTextIcon,
  FileXlsIcon,
  FileZipIcon,
  PauseIcon,
  PlayIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react/ssr";
import { useRef, useState, type MouseEvent } from "react";
import { extLabel, formatBytes, formatDuration } from "@/lib/format";
import { useChat } from "./store";
import type { ChatMessage, UploadState } from "./types";

/** Endereços do servidor (só depois de enviado) ou a prévia local. */
export function mediaUrls(m: ChatMessage) {
  const a = m.attachment;
  const server = m.id && a && a.id !== "local";
  return {
    src: server ? `/api/media/${a!.id}` : (m.local?.previewUrl ?? null),
    thumb: server && a!.hasThumb ? `/api/media/${a!.id}/thumb` : null,
    download: server ? `/api/media/${a!.id}/download` : null,
  };
}

const FILE_ICONS: Record<string, typeof FileIcon> = {
  PDF: FilePdfIcon,
  DOC: FileDocIcon,
  DOCX: FileDocIcon,
  XLS: FileXlsIcon,
  XLSX: FileXlsIcon,
  ZIP: FileZipIcon,
  TXT: FileTextIcon,
  CSV: FileCsvIcon,
};

export function ImageAttachment({ m }: { m: ChatMessage }) {
  const { src, thumb } = mediaUrls(m);
  const open = useChat((s) => s.openViewer);
  return (
    <button
      type="button"
      className="nl-media-btn"
      data-kind="image"
      title="Abrir imagem"
      aria-label={`Abrir imagem ${m.attachment?.name ?? ""}`.trim()}
      onClick={() => open(m.clientId)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- mídia privada servida por rota autenticada */}
      {thumb || src ? <img src={thumb ?? src!} alt="" /> : null}
    </button>
  );
}

export function VideoAttachment({ m }: { m: ChatMessage }) {
  const { src, thumb } = mediaUrls(m);
  const open = useChat((s) => s.openViewer);
  const processing = m.attachment?.status === "PENDING";
  return (
    <button
      type="button"
      className="nl-media-btn"
      data-kind="video"
      title={processing ? "Processando vídeo…" : "Reproduzir vídeo"}
      aria-label={
        processing ? "Processando vídeo…" : `Reproduzir vídeo ${m.attachment?.name ?? ""}`.trim()
      }
      onClick={() => !processing && open(m.clientId)}
      aria-disabled={processing || undefined}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- capa privada servida por rota autenticada
        <img src={thumb} alt="" />
      ) : src ? (
        <video src={src} muted preload="metadata" playsInline />
      ) : null}
      <span className="nl-play">
        <span>
          {processing ? (
            <CircleNotchIcon size={18} className="nl-spin" aria-hidden />
          ) : (
            <PlayIcon size={17} weight="fill" aria-hidden />
          )}
        </span>
      </span>
      {m.attachment?.durationSec ? (
        <span className="nl-dur-chip">
          <VideoCameraIcon size={12} aria-hidden />
          {formatDuration(m.attachment.durationSec)}
        </span>
      ) : null}
    </button>
  );
}

/** Player de áudio próprio: play/pause, trilho clicável, tempos (README §4.3). */
export function AudioAttachment({ m }: { m: ChatMessage }) {
  const { src } = mediaUrls(m);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(m.attachment?.durationSec ?? 0);
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      // só um áudio tocando por vez
      document.querySelectorAll("audio").forEach((x) => x !== a && x.pause());
      void a.play();
    } else a.pause();
  }

  function seek(e: MouseEvent<HTMLDivElement>) {
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    setT(a.currentTime);
  }

  return (
    <div className="nl-audio">
      {src ? (
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setT(0);
          }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) =>
            Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)
          }
        />
      ) : null}
      <button
        type="button"
        className="nl-audio-btn"
        onClick={toggle}
        aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
        disabled={!src}
      >
        {playing ? (
          <PauseIcon size={14} weight="fill" aria-hidden />
        ) : (
          <PlayIcon size={14} weight="fill" aria-hidden />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div
          className="nl-track"
          onClick={seek}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          aria-valuetext={formatDuration(t)}
          onKeyDown={(e) => {
            const a = ref.current;
            if (!a) return;
            if (e.key === "ArrowRight") a.currentTime = Math.min(dur, a.currentTime + 5);
            if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
          }}
        >
          <div className="nl-track-bar">
            <div className="nl-track-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="nl-track-knob" style={{ left: `${pct}%` }} aria-hidden />
        </div>
        <div className="nl-times">
          <span>{formatDuration(t)}</span>
          <span>{formatDuration(dur)}</span>
        </div>
      </div>
    </div>
  );
}

export function FileAttachment({ m }: { m: ChatMessage }) {
  const { download } = mediaUrls(m);
  const a = m.attachment!;
  const ext = extLabel(a.name);
  const Icon = FILE_ICONS[ext] ?? FileIcon;
  return (
    <div className="nl-file">
      <div className="nl-file-icon" aria-hidden>
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="nl-file-name" title={a.name}>
          {a.name}
        </div>
        <div className="nl-file-meta">
          {ext} · {formatBytes(a.sizeBytes)}
        </div>
      </div>
      {download ? (
        <a className="nl-file-dl" href={download} download={a.name} aria-label={`Baixar ${a.name}`}>
          <DownloadSimpleIcon size={18} aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

/** "Preparando envio…" → "Enviando arquivo… 82%" → "Concluído" (README §4.3). */
export function UploadProgress({ upload }: { upload: UploadState }) {
  if (upload.state === "error") return null;
  const label =
    upload.state === "preparing"
      ? "Preparando envio…"
      : upload.state === "uploading"
        ? "Enviando arquivo…"
        : "Concluído";
  return (
    <div className="nl-progress" data-state={upload.state} role="status" aria-live="polite">
      <div className="nl-progress-row">
        <span>
          {upload.state === "done" ? (
            <CheckIcon size={12} weight="bold" aria-hidden />
          ) : upload.state === "preparing" ? (
            <CircleNotchIcon size={12} className="nl-spin" aria-hidden />
          ) : null}
          {label}
        </span>
        <span>{upload.state === "preparing" ? "" : `${upload.progress}%`}</span>
      </div>
      <div className="nl-progress-bar">
        <div style={{ width: `${upload.state === "preparing" ? 0 : upload.progress}%` }} />
      </div>
    </div>
  );
}

/** "Processando vídeo…" enquanto o servidor converte (DECISOES §12). */
export function ProcessingNote() {
  return (
    <div className="nl-progress" role="status">
      <div className="nl-progress-row">
        <span>
          <CircleNotchIcon size={12} className="nl-spin" aria-hidden />
          Processando vídeo…
        </span>
      </div>
    </div>
  );
}

/** Pausa toda mídia tocando (ao bloquear). */
export function pauseAllMedia() {
  document.querySelectorAll("audio, video").forEach((el) => (el as HTMLMediaElement).pause());
}
