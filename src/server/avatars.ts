import { readFile, unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { ensureDirFor, resolveKey } from "@/lib/storage";
import { DomainError } from "./errors";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_FORMAT_ERROR = "Formato não suportado. Use JPG, PNG ou WEBP.";
export const AVATAR_SIZE_ERROR = "A foto excede o limite de 5 MB.";
const AVATAR_KEY = /^avatars\/[0-9a-f-]{36}\.webp$/;

/**
 * Foto de perfil: confere o tipo real pelos bytes (JPG/PNG/WEBP), corrige a rotação,
 * remove EXIF/GPS, recorta 256×256 e grava em WEBP. Retorna a chave no volume.
 */
export async function saveAvatar(bytes: Buffer): Promise<string> {
  if (bytes.length > AVATAR_MAX_BYTES) throw new DomainError("VALIDATION", AVATAR_SIZE_ERROR);
  let format: string | undefined;
  try {
    format = (await sharp(bytes).metadata()).format;
  } catch {
    throw new DomainError("VALIDATION", AVATAR_FORMAT_ERROR);
  }
  if (!format || !["jpeg", "png", "webp"].includes(format))
    throw new DomainError("VALIDATION", AVATAR_FORMAT_ERROR);

  const out = await sharp(bytes)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
  const key = `avatars/${crypto.randomUUID()}.webp`;
  await writeFile(await ensureDirFor(key), out);
  return key;
}

export function isAvatarKey(key: unknown): key is string {
  return typeof key === "string" && AVATAR_KEY.test(key);
}

export async function readAvatar(key: string): Promise<Buffer | null> {
  if (!isAvatarKey(key)) return null;
  return readFile(resolveKey(key)).catch(() => null);
}

export async function deleteAvatar(key: string | null | undefined) {
  if (!isAvatarKey(key)) return;
  await unlink(resolveKey(key)).catch(() => undefined);
}

/** URL pública da foto (o id aleatório é a própria permissão de acesso). */
export function avatarUrl(key: string | null | undefined): string | null {
  if (!isAvatarKey(key)) return null;
  return `/api/avatars/${key.slice("avatars/".length, -".webp".length)}`;
}
