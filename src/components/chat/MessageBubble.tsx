"use client";

import {
  ArrowClockwiseIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  FileIcon,
  ImageIcon,
  MicrophoneIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import { memo } from "react";
import { Button } from "@/components/ui/Button";
import { formatTime } from "@/lib/time";
import type { ChatMessage, ChatStatus } from "./types";

const STATUS_LABEL: Record<ChatStatus, string> = {
  sending: "enviando",
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "não enviada",
};

function StatusIcon({ status }: { status: ChatStatus }) {
  const common = { size: 14, "aria-hidden": true } as const;
  const icon =
    status === "sending" ? (
      <ClockIcon {...common} />
    ) : status === "sent" ? (
      <CheckIcon {...common} />
    ) : status === "delivered" ? (
      <ChecksIcon {...common} />
    ) : status === "read" ? (
      <ChecksIcon {...common} weight="bold" />
    ) : (
      <WarningCircleIcon {...common} weight="fill" />
    );
  return (
    <span data-status={status} className="inline-flex" title={STATUS_LABEL[status]}>
      {icon}
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

const KIND_LABEL = { IMAGE: "Imagem", VIDEO: "Vídeo", AUDIO: "Áudio", FILE: "Arquivo" } as const;
const KIND_ICON = {
  IMAGE: ImageIcon,
  VIDEO: VideoCameraIcon,
  AUDIO: MicrophoneIcon,
  FILE: FileIcon,
} as const;

/** README §4.3 — Message Bubble. Anexos ganham visual completo na Etapa 7. */
export const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  tail,
  first,
  isNew,
  onRetry,
}: {
  m: ChatMessage;
  mine: boolean;
  tail: boolean;
  first: boolean;
  isNew: boolean;
  onRetry: (clientId: string) => void;
}) {
  const time = formatTime(new Date(m.createdAt));
  const kind = m.kind === "TEXT" ? null : m.kind;
  const Icon = kind ? KIND_ICON[kind] : null;

  return (
    <div
      className="nl-msg"
      data-mine={mine || undefined}
      data-tail={tail || undefined}
      data-new={isNew || undefined}
      data-status={mine ? m.status : undefined}
      style={{ marginTop: first ? 14 : 3 }}
    >
      <div className="nl-bubble">
        {kind && Icon ? (
          <div className="nl-attach-chip">
            <Icon size={18} aria-hidden />
            {m.attachment?.name ?? KIND_LABEL[kind]}
          </div>
        ) : null}
        {m.body ? <div className="nl-text">{m.body}</div> : null}
        <div className="nl-meta">
          <time dateTime={m.createdAt}>{time}</time>
          {mine ? <StatusIcon status={m.status} /> : null}
        </div>
      </div>
      {mine && m.status === "failed" ? (
        <div className="nl-fail" role="alert">
          Não foi possível enviar.
          <Button
            variant="ghost"
            className="text-[12px]"
            icon={<ArrowClockwiseIcon size={13} aria-hidden />}
            onClick={() => onRetry(m.clientId)}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}
    </div>
  );
});
