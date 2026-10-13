"use client";

import {
  CornersOutIcon,
  DownloadSimpleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { formatDuration } from "@/lib/format";
import { formatDayTime } from "@/lib/time";
import { mediaUrls } from "./attachments";
import { useChat } from "./store";
import type { ChatMessage } from "./types";

const ZOOMS = [1, 1.5, 2, 2.5, 3];

/** README §4.3 — Visualizador de mídia (imagem com zoom; vídeo com controles próprios). Esc fecha. */
export function MediaViewer({ names }: { names: Record<string, string> }) {
  const key = useChat((s) => s.viewer);
  const m = useChat((s) => (key ? s.messages.find((x) => x.clientId === key) : undefined));
  const close = useChat((s) => s.openViewer);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!key) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [key, close]);

  if (!m || !m.attachment) return null;
  const { src, download, thumb } = mediaUrls(m);
  return (
    <div className="nl-viewer" role="dialog" aria-modal="true" aria-label={m.attachment.name}>
      {m.kind === "IMAGE" ? (
        <ImageView
          m={m}
          src={src}
          download={download}
          who={names[m.senderId] ?? ""}
          onClose={() => close(null)}
          closeRef={closeBtn}
        />
      ) : (
        <VideoView
          m={m}
          src={src}
          poster={thumb}
          download={download}
          who={names[m.senderId] ?? ""}
          onClose={() => close(null)}
          closeRef={closeBtn}
        />
      )}
    </div>
  );
}

type ViewProps = {
  m: ChatMessage;
  src: string | null;
  poster?: string | null;
  download: string | null;
  who: string;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
};

function Top({
  m,
  who,
  download,
  onClose,
  closeRef,
  children,
}: Omit<ViewProps, "src"> & { children?: React.ReactNode }) {
  return (
    <div className="nl-viewer-top">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{m.attachment!.name}</div>
        <div className="text-[12px] text-[var(--color-neutral-500)]">
          {who} · {formatDayTime(new Date(m.createdAt))}
        </div>
      </div>
      {children}
      {download ? (
        <a
          className="btn btn-icon btn-plain"
          href={download}
          download={m.attachment!.name}
          aria-label="Baixar"
        >
          <DownloadSimpleIcon size={18} aria-hidden />
        </a>
      ) : null}
      <IconButton
        ref={closeRef}
        label="Fechar"
        variant="plain"
        onClick={onClose}
        icon={<XIcon size={18} />}
      />
    </div>
  );
}

function ImageView(p: ViewProps) {
  const [z, setZ] = useState(0);
  const zoom = ZOOMS[z]!;
  return (
    <>
      <Top {...p}>
        <div className="flex items-center gap-1">
          <IconButton
            label="Diminuir zoom"
            variant="plain"
            disabled={z === 0}
            onClick={() => setZ(z - 1)}
            icon={<MagnifyingGlassMinusIcon size={18} />}
          />
          <span className="w-12 text-center text-[12.5px] tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            label="Aumentar zoom"
            variant="plain"
            disabled={z === ZOOMS.length - 1}
            onClick={() => setZ(z + 1)}
            icon={<MagnifyingGlassPlusIcon size={18} />}
          />
        </div>
      </Top>
      <div className="nl-viewer-stage" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
        {p.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- mídia privada servida por rota autenticada
          <img
            src={p.src}
            alt={p.m.attachment!.name}
            style={{ transform: `scale(${zoom})`, cursor: zoom > 1 ? "zoom-out" : "zoom-in" }}
            onClick={() => setZ(z === 0 ? 2 : 0)}
          />
        ) : null}
      </div>
    </>
  );
}

function VideoView(p: ViewProps) {
  const v = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(p.m.attachment?.durationSec ?? 0);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(80);
  const pct = dur ? (t / dur) * 100 : 0;

  useEffect(() => {
    if (v.current) v.current.volume = vol / 100;
  }, [vol]);

  function seek(e: MouseEvent<HTMLDivElement>) {
    const el = v.current;
    if (!el || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  }

  return (
    <>
      <Top {...p} />
      <div className="nl-viewer-stage" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
        <div className="nl-video-wrap">
          {p.src ? (
            <video
              ref={v}
              src={p.src}
              poster={p.poster ?? undefined}
              playsInline
              autoPlay
              muted={muted}
              onClick={() => (v.current?.paused ? v.current.play() : v.current?.pause())}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) =>
                Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)
              }
            />
          ) : null}
          <div className="nl-video-controls">
            <IconButton
              label={playing ? "Pausar" : "Reproduzir"}
              variant="plain"
              onClick={() => (v.current?.paused ? v.current.play() : v.current?.pause())}
              icon={
                playing ? (
                  <PauseIcon size={17} weight="fill" />
                ) : (
                  <PlayIcon size={17} weight="fill" />
                )
              }
            />
            <div
              className="nl-track flex-1"
              onClick={seek}
              role="slider"
              aria-label="Posição do vídeo"
              aria-valuemin={0}
              aria-valuemax={Math.round(dur)}
              aria-valuenow={Math.round(t)}
              tabIndex={0}
            >
              <div className="nl-track-bar">
                <div className="nl-track-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="nl-track-knob" style={{ left: `${pct}%` }} aria-hidden />
            </div>
            <span>
              {formatDuration(t)} / {formatDuration(dur)}
            </span>
            <IconButton
              label={muted ? "Ativar som" : "Silenciar"}
              variant="plain"
              onClick={() => setMuted(!muted)}
              icon={muted ? <SpeakerSlashIcon size={17} /> : <SpeakerHighIcon size={17} />}
            />
            <input
              className="nl-range"
              type="range"
              min={0}
              max={100}
              value={vol}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
            />
            <IconButton
              label="Tela cheia"
              variant="plain"
              onClick={() => void v.current?.requestFullscreen?.()}
              icon={<CornersOutIcon size={17} />}
            />
          </div>
        </div>
      </div>
    </>
  );
}
