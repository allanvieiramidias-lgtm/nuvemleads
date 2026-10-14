"use client";

import {
  MicrophoneIcon,
  PaperPlaneRightIcon,
  SmileyIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatDuration } from "@/lib/format";
import { AttachMenu } from "./AttachMenu";
import { checkPicked, MSG } from "./attach-rules";
import { DraftPreview, type Draft } from "./DraftPreview";
import type { AttachKind } from "./upload-queue";
import { useRecorder } from "./useRecorder";

// O catálogo completo (~1.900 emojis) só é baixado quando o painel abre pela primeira vez.
const EmojiPicker = dynamic(() => import("./EmojiPicker").then((m) => m.EmojiPicker), {
  ssr: false,
});

export type AttachInput = {
  file: File;
  kind: AttachKind;
  hint: "media" | "audio" | "file";
  caption?: string;
  durationSec?: number | null;
};

const TYPING_REFRESH_MS = 3000;
const TYPING_IDLE_MS = 3000;

/** README §4.3 — Composer: texto, emojis, anexos com prévia e gravação de áudio. */
export function Composer({
  onSend,
  onTyping,
  onAttach,
  notify,
}: {
  onSend: (text: string) => void;
  onTyping: (on: boolean) => void;
  onAttach: (a: AttachInput) => void;
  notify: (error: string) => void;
}) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [draft, setDraft] = useState<(Draft & { hint: "media" | "file" }) | null>(null);
  const rec = useRecorder(
    useCallback(
      (file: File, durationSec: number) =>
        onAttach({ file, kind: "AUDIO", hint: "audio", durationSec }),
      [onAttach],
    ),
    useCallback(() => notify(MSG.mic), [notify]),
  );
  const area = useRef<HTMLTextAreaElement>(null);
  const typingSince = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasText = text.trim().length > 0;

  // auto-altura até 5 linhas (o CSS limita a altura máxima)
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const stopTyping = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (typingSince.current) onTyping(false);
    typingSince.current = 0;
  }, [onTyping]);

  useEffect(() => stopTyping, [stopTyping]);

  function signalTyping() {
    const now = Date.now();
    // "digitando" com aviso a cada 3 s enquanto digita
    if (!typingSince.current || now - typingSince.current > TYPING_REFRESH_MS) {
      onTyping(true);
      typingSince.current = now;
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  function send() {
    if (!hasText) return;
    onSend(text);
    setText("");
    stopTyping();
    area.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha; não interfere na composição de acentos (IME)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function insertEmoji(em: string) {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + em + text.slice(end);
    setText(next);
    // Foco de volta ao campo já no clique (antes de o painel fechar), para o Enter seguinte
    // enviar; o cursor vai para depois do emoji assim que o texto novo aparece.
    el?.focus();
    requestAnimationFrame(() => el?.setSelectionRange(start + em.length, start + em.length));
  }

  return (
    <div className="nl-composer">
      <div className="nl-composer-row">
        {rec.recording ? (
          <>
            <button
              type="button"
              className="btn btn-icon btn-plain nl-attach-btn"
              aria-label="Descartar gravação"
              onClick={rec.discard}
            >
              <TrashIcon size={20} aria-hidden />
            </button>
            <div className="nl-rec-pill" role="status" aria-live="polite">
              <span className="nl-rec-dot" aria-hidden />
              <span className="nl-rec-time">{formatDuration(rec.elapsedSec)}</span>
              <span className="text-[var(--color-neutral-400)]">Gravando áudio…</span>
            </div>
            <button
              type="button"
              className="nl-round nl-round-send"
              aria-label="Enviar áudio"
              onClick={rec.finish}
            >
              <PaperPlaneRightIcon size={18} weight="fill" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <AttachMenu
              onPick={(file, source) => {
                const r = checkPicked(file, source);
                if ("error" in r) notify(r.error);
                else setDraft({ file, kind: r.kind, hint: source });
              }}
            />
            <div className="nl-field-pill">
              <textarea
                ref={area}
                className="nl-textarea"
                rows={1}
                placeholder="Digite uma mensagem..."
                aria-label="Mensagem"
                value={text}
                maxLength={4000}
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value.trim()) signalTyping();
                  else stopTyping();
                }}
                onKeyDown={onKeyDown}
                onBlur={stopTyping}
              />
              <button
                type="button"
                className="nl-emoji-btn"
                aria-label="Emojis"
                aria-expanded={emoji}
                data-emoji-toggle
                onClick={() => setEmoji((v) => !v)}
              >
                <SmileyIcon size={19} aria-hidden />
              </button>
            </div>
            {emoji ? (
              <EmojiPicker
                onPick={(em) => {
                  insertEmoji(em);
                  setEmoji(false);
                }}
                onClose={() => setEmoji(false)}
              />
            ) : null}
            {hasText ? (
              <button
                type="button"
                key="send"
                className="nl-round nl-round-send"
                aria-label="Enviar"
                onClick={send}
              >
                <PaperPlaneRightIcon size={18} weight="fill" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                key="mic"
                className="nl-round nl-round-mic"
                aria-label="Gravar áudio"
                onClick={() => void rec.start()}
              >
                <MicrophoneIcon size={19} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
      <DraftPreview
        draft={draft}
        onCancel={() => setDraft(null)}
        onSend={(caption, durationSec) => {
          if (draft)
            onAttach({
              file: draft.file,
              kind: draft.kind,
              hint: draft.hint,
              caption,
              durationSec,
            });
          setDraft(null);
        }}
      />
    </div>
  );
}
