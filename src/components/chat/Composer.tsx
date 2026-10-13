"use client";

import {
  MicrophoneIcon,
  PaperPlaneRightIcon,
  PaperclipIcon,
  SmileyIcon,
} from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EmojiPicker } from "./EmojiPicker";

const TYPING_REFRESH_MS = 3000;
const TYPING_IDLE_MS = 3000;

/** README §4.3 — Composer. Anexos e gravação de áudio chegam na Etapa 7. */
export function Composer({
  onSend,
  onTyping,
}: {
  onSend: (text: string) => void;
  onTyping: (on: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
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
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + em.length, start + em.length);
    });
  }

  return (
    <div className="nl-composer">
      <div className="nl-composer-row">
        <button
          type="button"
          className="btn btn-icon btn-plain nl-attach-btn"
          aria-label="Anexar"
          disabled
          title="Anexos chegam em breve"
        >
          <PaperclipIcon size={20} aria-hidden />
        </button>
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
            disabled
            title="Áudio chega em breve"
          >
            <MicrophoneIcon size={19} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
