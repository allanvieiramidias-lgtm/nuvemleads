import type { AttachKind } from "./upload-queue";

const MB = 1024 * 1024;
export const LIMITS = { file: 25 * MB, video: 100 * MB };
export const MSG = {
  tooBig: "O arquivo excede o limite de 25 MB.",
  videoTooBig: "O vídeo excede o limite de 100 MB.",
  imageFormat: "Formato não suportado. Use JPG, PNG ou WEBP.",
  blocked: "Este tipo de arquivo não é permitido.",
  mic: "Não foi possível acessar o microfone.",
} as const;

const BLOCKED = /\.(exe|msi|bat|cmd|sh|ps1|js|mjs|html?|svg|apk|dmg|com|scr|jar|vbs)$/i;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Validação local antes da prévia (o servidor confere de novo pelo conteúdo). */
export function checkPicked(
  file: File,
  source: "media" | "file",
): { kind: AttachKind } | { error: string } {
  if (BLOCKED.test(file.name)) return { error: MSG.blocked };
  if (source === "media") {
    if (IMAGE_TYPES.has(file.type))
      return file.size > LIMITS.file ? { error: MSG.tooBig } : { kind: "IMAGE" };
    if (file.type.startsWith("video/"))
      return file.size > LIMITS.video ? { error: MSG.videoTooBig } : { kind: "VIDEO" };
    return { error: MSG.imageFormat };
  }
  if (file.type.startsWith("video/"))
    return file.size > LIMITS.video ? { error: MSG.videoTooBig } : { kind: "FILE" };
  return file.size > LIMITS.file ? { error: MSG.tooBig } : { kind: "FILE" };
}
