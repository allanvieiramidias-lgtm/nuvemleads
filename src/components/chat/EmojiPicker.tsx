"use client";

import { useEffect, useRef } from "react";

/** 24 emojis comuns (README §4.3). Não é sticker nem GIF. */
export const EMOJIS = [
  "😊",
  "😂",
  "❤️",
  "👍",
  "🙏",
  "😍",
  "😉",
  "👏",
  "🔥",
  "✨",
  "😅",
  "🤔",
  "😢",
  "😮",
  "👀",
  "✅",
  "🎉",
  "☕",
  "🌙",
  "☁️",
  "💬",
  "🙌",
  "😴",
  "👋",
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest("[data-emoji-toggle]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="nl-emoji-panel" role="dialog" aria-label="Emojis">
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} aria-label={`Inserir ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
