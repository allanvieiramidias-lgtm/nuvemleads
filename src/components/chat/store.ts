"use client";

import { create } from "zustand";
import type {
  ChatMessage,
  ChatStatus,
  Connection,
  Contact,
  MessageDto,
  UploadState,
} from "./types";

const ORDER: Record<ChatStatus, number> = {
  failed: -1,
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/** Ordena por horário; empate pelo id (mesma regra do servidor). */
function sortMessages(list: ChatMessage[]) {
  return list.sort((a, b) =>
    a.createdAt === b.createdAt
      ? (a.id ?? a.clientId).localeCompare(b.id ?? b.clientId)
      : a.createdAt < b.createdAt
        ? -1
        : 1,
  );
}

function fromDto(m: MessageDto): ChatMessage {
  return { ...m };
}

type State = {
  messages: ChatMessage[];
  nextCursor: string | null;
  loaded: boolean;
  loadError: boolean;
  contact: Contact | null;
  contactTyping: boolean;
  connection: Connection;
  /** clientIds de mensagens que chegaram depois da carga inicial (para animar a entrada) */
  fresh: Set<string>;

  setInitial: (messages: MessageDto[], nextCursor: string | null) => void;
  prependOlder: (messages: MessageDto[], nextCursor: string | null) => void;
  /** Mensagem do servidor (ack do envio ou message:new): substitui a otimista pelo clientId. */
  upsert: (m: MessageDto) => void;
  addOptimistic: (m: ChatMessage) => void;
  /** Só atualiza se a mensagem já estiver na tela (não traz de volta o que foi apagado). */
  updateExisting: (m: MessageDto) => void;
  /** "Apagar para mim" (DECISOES §31). */
  removeMessage: (id: string) => void;
  /** "Limpar conversa": tira tudo o que já foi confirmado pelo servidor. */
  clearConfirmed: () => void;
  setLocalStatus: (clientId: string, status: "sending" | "failed") => void;
  setUpload: (clientId: string, upload: UploadState | undefined) => void;
  /** Visualizador de mídia aberto (README §6: viewer). */
  viewer: string | null;
  openViewer: (key: string | null) => void;
  /** Visualização única aberta agora (conteúdo só na memória até fechar) — DECISOES §30. */
  onceView: OnceView | null;
  setOnceView: (v: OnceView | null) => void;
  setStatus: (id: string, status: "delivered" | "read") => void;
  /** Marca localmente como lidas as mensagens da outra pessoa até `upTo` (inclusive). */
  markReadUpTo: (contactId: string, upTo: string) => void;
  setContact: (c: Contact | null) => void;
  setPresence: (p: { online: boolean; lastSeenAt: string | null }) => void;
  setTyping: (on: boolean) => void;
  setConnection: (c: Connection) => void;
  setLoadError: (v: boolean) => void;
  /** Apaga tudo da memória (ao bloquear/sair). */
  reset: () => void;
};

export type OnceView = {
  id: string;
  kind: ChatMessage["kind"];
  body: string | null;
  attachment: ChatMessage["attachment"];
};

const initial = {
  messages: [] as ChatMessage[],
  nextCursor: null,
  loaded: false,
  loadError: false,
  contact: null,
  contactTyping: false,
  connection: "online" as Connection,
  fresh: new Set<string>(),
  viewer: null as string | null,
  onceView: null as OnceView | null,
};

export const useChat = create<State>((set) => ({
  ...initial,

  setInitial: (messages, nextCursor) =>
    set((s) => {
      // mantém mensagens locais ainda não confirmadas (fila offline)
      const pending = s.messages.filter((m) => !m.id);
      return {
        messages: sortMessages([...messages.map(fromDto), ...pending]),
        nextCursor,
        loaded: true,
      };
    }),

  prependOlder: (messages, nextCursor) =>
    set((s) => {
      const known = new Set(s.messages.map((m) => m.id));
      return {
        messages: sortMessages([
          ...messages.filter((m) => !known.has(m.id)).map(fromDto),
          ...s.messages,
        ]),
        nextCursor,
      };
    }),

  upsert: (m) =>
    set((s) => {
      const i = s.messages.findIndex(
        (x) => x.id === m.id || (x.clientId === m.clientId && x.senderId === m.senderId),
      );
      const fresh = new Set(s.fresh);
      if (i === -1) {
        fresh.add(m.clientId);
        return { messages: sortMessages([...s.messages, fromDto(m)]), fresh };
      }
      const prev = s.messages[i]!;
      // nunca volta o status (ex.: ack "enviada" chegando depois de "entregue")
      const status = ORDER[prev.status] > ORDER[m.status] ? prev.status : m.status;
      const next = [...s.messages];
      next[i] = { ...fromDto(m), status, local: prev.local };
      return { messages: sortMessages(next) };
    }),

  updateExisting: (m) =>
    set((s) => {
      const i = s.messages.findIndex((x) => x.id === m.id);
      if (i === -1) return {};
      const prev = s.messages[i]!;
      const status = ORDER[prev.status] > ORDER[m.status] ? prev.status : m.status;
      const next = [...s.messages];
      next[i] = { ...fromDto(m), status, local: prev.local };
      return { messages: next };
    }),

  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
      onceView: s.onceView?.id === id ? null : s.onceView,
    })),

  clearConfirmed: () =>
    set((s) => ({ messages: s.messages.filter((m) => !m.id), nextCursor: null, viewer: null })),

  addOptimistic: (m) =>
    set((s) => {
      const fresh = new Set(s.fresh);
      fresh.add(m.clientId);
      return { messages: [...s.messages, m], fresh };
    }),

  setLocalStatus: (clientId, status) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.clientId === clientId && !m.id ? { ...m, status } : m)),
    })),

  setUpload: (clientId, upload) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.clientId === clientId ? { ...m, local: { ...m.local, upload } } : m,
      ),
    })),

  openViewer: (viewer) => set({ viewer }),
  setOnceView: (onceView) => set({ onceView }),

  setStatus: (id, status) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id && ORDER[status] > ORDER[m.status] ? { ...m, status } : m,
      ),
    })),

  markReadUpTo: (contactId, upTo) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.senderId === contactId && m.createdAt <= upTo && m.status !== "read"
          ? { ...m, status: "read" }
          : m,
      ),
    })),

  setContact: (contact) => set({ contact }),
  setPresence: (p) =>
    set((s) =>
      s.contact
        ? { contact: { ...s.contact, ...p }, contactTyping: p.online ? s.contactTyping : false }
        : {},
    ),
  setTyping: (on) => set({ contactTyping: on }),
  setConnection: (connection) => set({ connection }),
  setLoadError: (loadError) => set({ loadError }),
  reset: () => set({ ...initial, fresh: new Set() }),
}));
