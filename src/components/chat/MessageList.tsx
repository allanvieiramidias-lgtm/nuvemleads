"use client";

import { LockKeyIcon } from "@phosphor-icons/react/ssr";
import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { formatDay } from "@/lib/time";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "./store";
import type { ChatMessage } from "./types";

const dayKey = (iso: string) => formatDay(new Date(iso));
const NEAR_BOTTOM_PX = 400;

/** README §4.3: Date Divider, Message Group (gap 3 / 14), rabicho na última bolha do grupo. */
export function MessageList({
  meId,
  meFirst,
  contactFirst,
  onLoadOlder,
  onRetry,
  empty,
}: {
  meId: string;
  meFirst: string;
  contactFirst: string;
  onLoadOlder: () => Promise<void>;
  onRetry: (clientId: string) => void;
  /** Mostrado quando ainda não há mensagens (o "digitando" continua aparecendo). */
  empty?: React.ReactNode;
}) {
  const messages = useChat((s) => s.messages);
  const fresh = useChat((s) => s.fresh);
  const typing = useChat((s) => s.contactTyping);
  const hasOlder = useChat((s) => !!s.nextCursor);
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const loadingOlder = useRef(false);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const last = messages.at(-1);
  const lastKey = last ? (last.id ?? last.clientId) : null;
  const firstRender = useRef(true);

  // Rolagem automática: ao abrir; ao chegar mensagem nova se estiver perto do fim; sempre que for minha.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (anchor.current) {
      // carregou mensagens antigas: mantém o que estava na tela no mesmo lugar
      el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.height);
      anchor.current = null;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (firstRender.current || nearBottom || last?.senderId === meId)
      el.scrollTop = el.scrollHeight;
    firstRender.current = false;
  }, [lastKey, typing, meId, last?.senderId, messages.length]);

  // Paginação reversa: ao ver o topo, carrega as anteriores.
  useEffect(() => {
    const el = topSentinel.current;
    const root = scroller.current;
    if (!el || !root || !hasOlder) return;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting || loadingOlder.current) return;
        loadingOlder.current = true;
        anchor.current = { height: root.scrollHeight, top: root.scrollTop };
        try {
          await onLoadOlder();
        } finally {
          loadingOlder.current = false;
        }
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasOlder, onLoadOlder]);

  const rows = buildRows(messages);
  return (
    <div ref={scroller} className="nl-msgs" data-nl-msgs>
      <div className="nl-col" role="log" aria-label="Mensagens" aria-live="polite">
        {hasOlder ? <div ref={topSentinel} className="h-px" aria-hidden /> : null}
        {!hasOlder && rows.length > 0 ? (
          <div className="nl-seal">
            <LockKeyIcon size={13} aria-hidden />
            Conversa privada entre {meFirst} e {contactFirst}
          </div>
        ) : null}
        {rows.length === 0 ? empty : null}
        {rows.map(({ m, day, newDay, first, tail }) => (
          <Fragment key={m.id ?? m.clientId}>
            {newDay ? (
              <div className="nl-day" role="separator">
                {day}
              </div>
            ) : null}
            <MessageBubble
              m={m}
              mine={m.senderId === meId}
              first={first && !newDay}
              tail={tail}
              isNew={fresh.has(m.clientId)}
              onRetry={onRetry}
            />
          </Fragment>
        ))}
        {typing ? (
          <div
            className="nl-msg"
            data-tail
            style={{ marginTop: 14 }}
            role="status"
            aria-label={`${contactFirst} está digitando`}
          >
            <div className="nl-bubble nl-typing" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Datas e grupos: mensagens seguidas da mesma pessoa no mesmo dia formam um grupo. */
function buildRows(messages: ChatMessage[]) {
  const days = messages.map((m) => dayKey(m.createdAt));
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = days[i]!;
    const newDay = i === 0 || days[i - 1] !== day;
    return {
      m,
      day,
      newDay,
      first: newDay || !prev || prev.senderId !== m.senderId,
      tail: !next || next.senderId !== m.senderId || days[i + 1] !== day,
    };
  });
}
