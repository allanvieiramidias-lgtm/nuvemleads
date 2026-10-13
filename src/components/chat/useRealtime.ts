"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { flushQueue } from "./send-queue";
import { useChat } from "./store";
import type { MessageDto, Settings } from "./types";

type Handlers = {
  meId: string;
  onRevoked: () => void;
  onLocked: (reason: string) => void;
  onRoomChanged: () => void;
  onSettings: (s: Settings) => void;
  /** Recarrega a conversa do servidor (ex.: depois de reconectar). */
  onResync: () => void;
};

/** Conexão Socket.IO da conversa (ARQUITETURA §8). Devolve funções para avisar o servidor. */
export function useRealtime(h: Handlers) {
  const ref = useRef<Socket | null>(null);
  const handlers = useRef(h);
  useLayoutEffect(() => {
    handlers.current = h;
  });

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    ref.current = socket;
    const chat = useChat.getState;
    let everConnected = false;
    let reconnectAfterRoomChange = false;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    const goOffline = () => {
      if (offlineTimer) return;
      // evita piscar a faixa em quedas muito curtas
      offlineTimer = setTimeout(
        () => chat().setConnection(navigator.onLine ? "reconnecting" : "offline"),
        1500,
      );
    };

    socket.on("connect", () => {
      if (offlineTimer) clearTimeout(offlineTimer);
      offlineTimer = null;
      chat().setConnection("online");
      if (everConnected) handlers.current.onResync();
      everConnected = true;
      void flushQueue();
    });
    socket.on("disconnect", (reason) => {
      // o servidor desconecta todos quando o par ativo muda: volta a conectar nas salas novas
      if (reason === "io server disconnect" && reconnectAfterRoomChange) {
        reconnectAfterRoomChange = false;
        setTimeout(() => socket.connect(), 300);
        return;
      }
      if (reason === "io server disconnect" || reason === "io client disconnect") return;
      goOffline();
    });
    socket.on("connect_error", (err) => {
      if (err.message === "REVOKED") handlers.current.onRevoked();
      else if (err.message === "LOCKED") handlers.current.onLocked("MANUAL");
      else goOffline();
    });

    socket.on("message:new", (m: MessageDto) => {
      chat().upsert(m);
      if (m.senderId !== handlers.current.meId) {
        socket.emit("message:delivered", { id: m.id });
        chat().setTyping(false);
      }
    });
    socket.on("message:status", (p: { id: string; status: "delivered" | "read" }) =>
      chat().setStatus(p.id, p.status),
    );
    socket.on("presence", (p: { userId: string; online: boolean; lastSeenAt: string | null }) => {
      if (p.userId !== handlers.current.meId) chat().setPresence(p);
    });
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    socket.on("typing", (p: { on: boolean }) => {
      chat().setTyping(p.on);
      if (typingTimer) clearTimeout(typingTimer);
      // se o aviso de parar se perder, some sozinho
      if (p.on) typingTimer = setTimeout(() => chat().setTyping(false), 6000);
    });
    socket.on("session:revoked", () => handlers.current.onRevoked());
    socket.on("session:locked", (p: { reason: string }) => handlers.current.onLocked(p.reason));
    socket.on("room:changed", () => {
      reconnectAfterRoomChange = true;
      handlers.current.onRoomChanged();
    });
    socket.on("settings:updated", (s: Settings) => handlers.current.onSettings(s));

    const onOnline = () => {
      // a conexão em tempo real pode ter sobrevivido à queda: aí só limpa a faixa
      if (socket.connected) {
        if (offlineTimer) clearTimeout(offlineTimer);
        offlineTimer = null;
        chat().setConnection("online");
      } else socket.connect();
      void flushQueue();
    };
    const onOffline = () => chat().setConnection("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (offlineTimer) clearTimeout(offlineTimer);
      if (typingTimer) clearTimeout(typingTimer);
      socket.removeAllListeners();
      socket.disconnect();
      ref.current = null;
    };
  }, []);

  return {
    typing: (on: boolean) => ref.current?.emit("typing", { on }),
    /** Avisa que vai bloquear e desconecta (DECISOES §10). */
    disconnectForLock: () => {
      ref.current?.emit("session:locking");
      ref.current?.disconnect();
    },
  };
}
