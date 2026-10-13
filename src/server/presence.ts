/** Quem está com a conversa aberta e desbloqueada agora (sockets conectados por pessoa). */
const g = globalThis as unknown as { nlPresence?: Map<string, Set<string>> };
const sockets = (g.nlPresence ??= new Map());

export function addSocket(userId: string, socketId: string): boolean {
  const set = sockets.get(userId) ?? new Set<string>();
  const wasOnline = set.size > 0;
  set.add(socketId);
  sockets.set(userId, set);
  return !wasOnline;
}

/** Retorna true se a pessoa ficou offline (último socket saiu). */
export function removeSocket(userId: string, socketId: string): boolean {
  const set = sockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    sockets.delete(userId);
    return true;
  }
  return false;
}

export function isOnline(userId: string): boolean {
  return (sockets.get(userId)?.size ?? 0) > 0;
}
