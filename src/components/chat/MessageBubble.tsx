"use client";

import {
  ArrowClockwiseIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import { memo } from "react";
import { Button } from "@/components/ui/Button";
import { formatTime } from "@/lib/time";
import {
  AudioAttachment,
  FileAttachment,
  ImageAttachment,
  ProcessingNote,
  UploadProgress,
  VideoAttachment,
} from "./attachments";
import type { ChatMessage, ChatStatus } from "./types";
import { OnceBubble } from "./view-once";

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

/** README §4.3 — Message Bubble (texto, imagem, vídeo, áudio, arquivo). */
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
  // Visualização única ou mídia expirada: a bolha nunca mostra o conteúdo (DECISOES §30).
  const once = m.viewOnce || m.expired;
  const hasMedia = !once && m.kind !== "TEXT" && !!m.attachment;
  const upload = m.local?.upload;

  return (
    <div
      className="nl-msg"
      data-mine={mine || undefined}
      data-tail={tail || undefined}
      data-new={isNew || undefined}
      data-status={mine ? m.status : undefined}
      style={{ marginTop: first ? 14 : 3 }}
    >
      <div
        className="nl-bubble"
        data-media={hasMedia || undefined}
        data-kind={m.kind.toLowerCase()}
        data-once={once || undefined}
      >
        {once ? <OnceBubble m={m} mine={mine} /> : null}
        {hasMedia && m.kind === "IMAGE" ? <ImageAttachment m={m} /> : null}
        {hasMedia && m.kind === "VIDEO" ? <VideoAttachment m={m} /> : null}
        {hasMedia && m.kind === "AUDIO" ? <AudioAttachment m={m} /> : null}
        {hasMedia && m.kind === "FILE" ? <FileAttachment m={m} /> : null}
        {m.body && !once ? <div className="nl-text">{m.body}</div> : null}
        {upload ? <UploadProgress upload={upload} /> : null}
        {!upload && m.kind === "VIDEO" && m.attachment?.status === "PENDING" ? (
          <ProcessingNote />
        ) : null}
        <div className="nl-meta">
          <time dateTime={m.createdAt}>{time}</time>
          {mine ? <StatusIcon status={m.status} /> : null}
        </div>
      </div>
      {mine && m.status === "failed" ? (
        <div className="nl-fail" role="alert">
          {m.kind === "TEXT" ? "Não foi possível enviar." : "Não foi possível enviar o arquivo."}
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
