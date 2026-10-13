"use client";

import { CameraIcon, FileIcon, ImageIcon, PaperclipIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";
import { openPicker } from "@/components/lock/picker-guard";

/** README §4.3 — Menu de anexo: Foto ou vídeo · Câmera (só no celular) · Arquivo. */
export function AttachMenu({ onPick }: { onPick: (file: File, source: "media" | "file") => void }) {
  const [open, setOpen] = useState(false);
  const [touch, setTouch] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setTouch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!menu.current?.contains(t) && !t.closest("[data-attach-toggle]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  function pick(input: HTMLInputElement | null) {
    setOpen(false);
    if (input) openPicker(input);
  }

  function changed(e: React.ChangeEvent<HTMLInputElement>, source: "media" | "file") {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onPick(f, source);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-icon btn-plain nl-attach-btn"
        aria-label="Anexar"
        aria-haspopup="menu"
        aria-expanded={open}
        data-attach-toggle
        onClick={() => setOpen((v) => !v)}
      >
        <PaperclipIcon size={20} aria-hidden />
      </button>
      {open ? (
        <div ref={menu} className="nl-attach-menu" role="menu" aria-label="Anexar">
          <button type="button" role="menuitem" onClick={() => pick(media.current)}>
            <ImageIcon size={20} aria-hidden />
            <span>
              Foto ou vídeo
              <small>JPG, PNG, WEBP ou vídeo</small>
            </span>
          </button>
          {touch ? (
            <button type="button" role="menuitem" onClick={() => pick(camera.current)}>
              <CameraIcon size={20} aria-hidden />
              <span>Câmera</span>
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => pick(file.current)}>
            <FileIcon size={20} aria-hidden />
            <span>
              Arquivo
              <small>Até 25 MB</small>
            </span>
          </button>
        </div>
      ) : null}
      <input
        ref={media}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,video/*"
        data-testid="pick-media"
        onChange={(e) => changed(e, "media")}
      />
      <input
        ref={camera}
        type="file"
        hidden
        accept="image/*,video/*"
        capture="environment"
        data-testid="pick-camera"
        onChange={(e) => changed(e, "media")}
      />
      <input
        ref={file}
        type="file"
        hidden
        data-testid="pick-file"
        onChange={(e) => changed(e, "file")}
      />
    </>
  );
}
