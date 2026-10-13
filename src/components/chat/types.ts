import type { MessageDto } from "@/server/messages";

export type { MessageDto };

/** Status no cliente: os do servidor + os locais do envio otimista (README §6). */
export type ChatStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type ChatMessage = Omit<MessageDto, "status" | "id"> & {
  /** id do servidor; null enquanto a mensagem otimista não foi confirmada */
  id: string | null;
  status: ChatStatus;
};

export type Me = {
  userId: string;
  name: string;
  slug: string;
  tone: "ACCENT" | "NEUTRAL";
  avatarUrl: string | null;
};

export type Contact = {
  id: string;
  name: string;
  tone: "ACCENT" | "NEUTRAL";
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
};

export type Settings = { autoLockMinutes: number; lockOnTabLeave: boolean; lockOnReopen: boolean };

export type Connection = "online" | "offline" | "reconnecting";
