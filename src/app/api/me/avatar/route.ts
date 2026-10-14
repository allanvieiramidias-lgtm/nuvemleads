import { db } from "@/db";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, forbiddenOrigin, handleError, isSameOrigin, json } from "@/lib/http";
import {
  AVATAR_FORMAT_ERROR,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_ERROR,
  avatarUrl,
  deleteAvatar,
  saveAvatar,
} from "@/server/avatars";
import { emit } from "@/server/events";
import { getUser, updateUserProfile } from "@/server/users";

/**
 * "Minha foto" (DECISOES §31): a própria pessoa troca ou remove a foto de perfil.
 * Mesmo tratamento das fotos do admin (sem EXIF/GPS, redimensionada). Sessão desbloqueada.
 */
async function withSession(req: Request, fn: (userId: string) => Promise<Response>) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const session = await getCurrentSession();
    if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
    if (session.locked) return apiError("LOCKED", "Sessão bloqueada.");
    return await fn(session.user.id);
  } catch (err) {
    return handleError(err);
  }
}

async function setAvatar(userId: string, key: string | null) {
  const before = await getUser(db, userId);
  const user = await updateUserProfile(db, userId, { avatarKey: key });
  if (before?.avatarKey && before.avatarKey !== key) await deleteAvatar(before.avatarKey);
  emit("profile:updated", { userId });
  return json({ avatarUrl: avatarUrl(user.avatarKey) });
}

export const POST = (req: Request) =>
  withSession(req, async (userId) => {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > AVATAR_MAX_BYTES + 64 * 1024) return apiError("VALIDATION", AVATAR_SIZE_ERROR);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError("VALIDATION", AVATAR_FORMAT_ERROR);
    if (file.size > AVATAR_MAX_BYTES) return apiError("VALIDATION", AVATAR_SIZE_ERROR);
    return setAvatar(userId, await saveAvatar(Buffer.from(await file.arrayBuffer())));
  });

export const DELETE = (req: Request) => withSession(req, (userId) => setAvatar(userId, null));
