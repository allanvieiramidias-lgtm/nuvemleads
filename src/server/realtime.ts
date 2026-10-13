// Tempo real (ARQUITETURA §8): Socket.IO no mesmo processo do Next.
import { eq } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getActiveConversation, otherParticipant } from "./conversations";
import { on } from "./events";
import { getMessageDto, markDelivered } from "./messages";
import { getSessionByToken, type SessionInfo } from "./participant-auth";
import { lockIdleSessions } from "./session-lock";
import { addSocket, isOnline, removeSocket } from "./presence";

const isProd = process.env.NODE_ENV === "production";
const USER_COOKIE = isProd ? "__Host-nl_user" : "nl_user";

type Data = { session: SessionInfo; conversationId: string; contactId: string };
type NlSocket = Socket & { data: Data };

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false;
  try {
    const h = new URL(origin).host;
    if (host && h === host) return true;
    if (process.env.APP_URL && h === new URL(process.env.APP_URL).host) return true;
  } catch {
    /* origem inválida */
  }
  return false;
}

const userRoom = (id: string) => `user:${id}`;
const convRoom = (id: string) => `conv:${id}`;

async function presencePayload(userId: string) {
  const [u] = await db
    .select({ lastActiveAt: users.lastActiveAt })
    .from(users)
    .where(eq(users.id, userId));
  return { userId, online: isOnline(userId), lastSeenAt: u?.lastActiveAt?.toISOString() ?? null };
}

export function attachRealtime(io: Server, opts: { idleSweepMs?: number } = {}) {
  // Varredura de inatividade no servidor (ARQUITETURA §7): a cada 30 s.
  const sweep = setInterval(
    () => void lockIdleSessions(db).catch(() => undefined),
    opts.idleSweepMs ?? 30_000,
  );
  sweep.unref();

  // CSRF no handshake: só a própria origem.
  io.use(async (socket, next) => {
    try {
      const { headers } = socket.handshake;
      if (!originAllowed(headers.origin, headers["x-forwarded-host"]?.toString() ?? headers.host)) {
        return next(new Error("FORBIDDEN"));
      }
      const session = await getSessionByToken(db, readCookie(headers.cookie, USER_COOKIE));
      if (!session) return next(new Error("REVOKED"));
      // Sessão bloqueada não conecta (DECISOES §10).
      if (session.locked) return next(new Error("LOCKED"));
      const conv = await getActiveConversation(db);
      if (!conv || (conv.userAId !== session.user.id && conv.userBId !== session.user.id)) {
        return next(new Error("NO_CONVERSATION"));
      }
      (socket as NlSocket).data = {
        session,
        conversationId: conv.id,
        contactId: otherParticipant(conv, session.user.id),
      };
      next();
    } catch {
      next(new Error("INTERNAL"));
    }
  });

  io.on("connection", async (raw) => {
    const socket = raw as NlSocket;
    const { session, conversationId, contactId } = socket.data;
    const userId = session.user.id;
    await socket.join([userRoom(userId), convRoom(conversationId), `session:${session.sessionId}`]);

    const cameOnline = addSocket(userId, socket.id);
    if (cameOnline)
      socket.to(convRoom(conversationId)).emit("presence", await presencePayload(userId));
    // estado atual do contato para quem acabou de entrar
    socket.emit("presence", await presencePayload(contactId));

    socket.on("message:delivered", async (payload: { id?: unknown }) => {
      if (typeof payload?.id !== "string" || !/^[0-9a-f-]{36}$/.test(payload.id)) return;
      const conv = await getActiveConversation(db);
      if (conv && conv.id === conversationId) await markDelivered(db, conv, userId, [payload.id]);
    });

    socket.on("typing", (payload: { on?: unknown }) => {
      socket.to(userRoom(contactId)).emit("typing", { userId, on: payload?.on === true });
    });

    // A pessoa avisa que vai bloquear e desconecta (DECISOES §10).
    socket.on("session:locking", () => socket.disconnect(true));

    socket.on("disconnect", async () => {
      socket.to(userRoom(contactId)).emit("typing", { userId, on: false });
      if (removeSocket(userId, socket.id)) {
        await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
        io.to(convRoom(conversationId)).emit("presence", await presencePayload(userId));
      }
    });
  });

  // Eventos vindos das rotas (mesmo processo).
  on("message:new", ({ conversationId, message }) => {
    io.to(convRoom(conversationId)).emit("message:new", message);
  });
  on("attachment:updated", async ({ attachmentId, conversationId }) => {
    if (!conversationId) return;
    const message = await getMessageDto(db, attachmentId);
    if (message) io.to(convRoom(conversationId)).emit("message:updated", message);
  });
  on("message:status", ({ senderId, id, status }) => {
    io.to(userRoom(senderId)).emit("message:status", { id, status });
  });
  on("session:revoked", ({ userId }) => {
    io.to(userRoom(userId)).emit("session:revoked", {});
    io.in(userRoom(userId)).disconnectSockets(true);
  });
  on("session:locked", ({ sessionId, reason }) => {
    io.to(`session:${sessionId}`).emit("session:locked", { reason });
    io.in(`session:${sessionId}`).disconnectSockets(true);
  });
  on("settings:updated", (settings) => {
    io.emit("settings:updated", settings);
  });
  // O par ativo mudou: todos recarregam a conversa.
  on("room:changed", () => {
    io.emit("room:changed", {});
    io.disconnectSockets(true);
  });
}
