import { adminRoute } from "@/lib/admin-api";
import { apiError, json } from "@/lib/http";
import {
  AVATAR_FORMAT_ERROR,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_ERROR,
  avatarUrl,
  saveAvatar,
} from "@/server/avatars";

/** Envia a foto de perfil (multipart, campo `file`); devolve a chave para salvar no usuário. */
export const POST = adminRoute(async (req) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > AVATAR_MAX_BYTES + 64 * 1024) return apiError("VALIDATION", AVATAR_SIZE_ERROR);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("VALIDATION", AVATAR_FORMAT_ERROR);
  if (file.size > AVATAR_MAX_BYTES) return apiError("VALIDATION", AVATAR_SIZE_ERROR);
  const key = await saveAvatar(Buffer.from(await file.arrayBuffer()));
  return json({ avatarKey: key, avatarUrl: avatarUrl(key) }, { status: 201 });
});
