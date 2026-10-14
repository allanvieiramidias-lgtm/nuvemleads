import { EventEmitter } from "node:events";

/**
 * Barramento interno do processo. As rotas avisam o que mudou; o Socket.IO (Etapa 6)
 * escuta e repassa aos navegadores (session:revoked, settings:updated…).
 */
import type { MessageDto } from "./messages";

export type AppEvents = {
  "message:new": { conversationId: string; message: MessageDto };
  /** Visualização única aberta, conteúdo apagado ou mídia expirada (DECISOES §30). */
  "message:updated": { conversationId: string; message: MessageDto };
  "attachment:updated": {
    attachmentId: string;
    conversationId: string | null;
    status: "READY" | "FAILED";
  };
  "message:status": {
    conversationId: string;
    senderId: string;
    id: string;
    status: "delivered" | "read";
  };
  "session:locked": { sessionId: string; reason: "IDLE" | "MANUAL" | "TAB" | "BLUR" | "REOPEN" };
  "session:revoked": { userId: string; reason: "PIN_CHANGED" | "DEACTIVATED" };
  "settings:updated": {
    autoLockMinutes: number;
    lockOnTabLeave: boolean;
    lockOnReopen: boolean;
    unreadNotice: boolean;
    mediaRetentionDays: number;
  };
  "room:changed": Record<string, never>;
};

const g = globalThis as unknown as { nlBus?: EventEmitter };
const bus = (g.nlBus ??= new EventEmitter());

export function emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]) {
  bus.emit(event, payload);
}

export function on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void) {
  bus.on(event, listener);
  return () => bus.off(event, listener);
}
