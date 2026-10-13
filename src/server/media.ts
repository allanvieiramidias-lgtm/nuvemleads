import { execFile } from "node:child_process";
import { rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";

const run = promisify(execFile);

export const MB = 1024 * 1024;
export const maxUploadBytes = () => Number(process.env.MAX_UPLOAD_MB ?? 25) * MB;
export const maxVideoBytes = () => Number(process.env.MAX_VIDEO_MB ?? 100) * MB;

export const ERR = {
  tooBig: "O arquivo excede o limite de 25 MB.",
  videoTooBig: "O vídeo excede o limite de 100 MB.",
  imageFormat: "Formato não suportado. Use JPG, PNG ou WEBP.",
  blocked: "Este tipo de arquivo não é permitido.",
  empty: "O arquivo está vazio.",
} as const;

/** Executáveis e scripts nunca entram (ARQUITETURA §7). */
const BLOCKED_EXT = new Set([
  "exe",
  "msi",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "js",
  "mjs",
  "html",
  "htm",
  "svg",
  "apk",
  "dmg",
  "com",
  "scr",
  "jar",
  "vbs",
]);
const BLOCKED_DETECTED = new Set([
  "exe",
  "msi",
  "elf",
  "apk",
  "dmg",
  "mach",
  "macho",
  "jar",
  "swf",
  "dll",
  "wasm",
]);
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXT = new Set([
  "webm",
  "ogg",
  "oga",
  "opus",
  "m4a",
  "mp4",
  "mp3",
  "mpeg",
  "wav",
  "aac",
]);
const PLAYABLE_VIDEO = new Set(["h264", "vp8", "vp9", "av1"]);

export function extOf(name: string): string {
  const e = path.extname(name).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(e) ? e : "";
}

export function isBlockedName(name: string) {
  return BLOCKED_EXT.has(extOf(name));
}

export type Probe = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  hasAudio: boolean;
};

/** ffprobe: duração, dimensões e codec. */
export async function probe(file: string): Promise<Probe | null> {
  try {
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
      { timeout: 30_000, maxBuffer: 4 * MB },
    );
    const j = JSON.parse(stdout) as {
      streams?: {
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        duration?: string;
        tags?: { rotate?: string };
        side_data_list?: { rotation?: number }[];
      }[];
      format?: { duration?: string };
    };
    const v = j.streams?.find(
      (s) => s.codec_type === "video" && s.codec_name !== "mjpeg" && s.codec_name !== "png",
    );
    const a = j.streams?.find((s) => s.codec_type === "audio");
    const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration);
    // vídeo de celular gravado "em pé" vem com rotação de 90°: troca largura/altura
    const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.[0]?.rotation ?? 0));
    const swap = rot === 90 || rot === 270;
    return {
      durationSec: Number.isFinite(dur) ? Math.round(dur) : null,
      width: v ? ((swap ? v.height : v.width) ?? null) : null,
      height: v ? ((swap ? v.width : v.height) ?? null) : null,
      videoCodec: v?.codec_name ?? null,
      hasAudio: !!a,
    };
  } catch {
    return null;
  }
}

export type Classified =
  | { kind: "IMAGE"; mime: string; ext: string }
  | { kind: "VIDEO"; mime: string; ext: string; probe: Probe }
  | { kind: "AUDIO"; mime: string; ext: string; probe: Probe }
  | { kind: "FILE"; mime: string; ext: string };

/**
 * Tipo real pelos bytes (não pela extensão). `hint` = o que a pessoa escolheu no menu
 * ("media" = Foto ou vídeo/Câmera, "audio" = gravação, "file" = Arquivo).
 */
export async function classify(
  file: string,
  originalName: string,
  hint: "media" | "audio" | "file",
): Promise<Classified> {
  const ft = await fileTypeFromFile(file).catch(() => undefined);
  const nameExt = extOf(originalName);
  if (ft && BLOCKED_DETECTED.has(ft.ext)) throw new Error(ERR.blocked);
  if (isBlockedName(originalName)) throw new Error(ERR.blocked);

  if (ft && IMAGE_MIME.has(ft.mime))
    return { kind: "IMAGE", mime: ft.mime, ext: ft.ext === "jpg" ? "jpg" : ft.ext };

  if (
    ft &&
    (ft.mime.startsWith("video/") ||
      ft.mime.startsWith("audio/") ||
      ft.ext === "mp4" ||
      ft.ext === "webm" ||
      ft.ext === "mov")
  ) {
    const p = await probe(file);
    if (p?.videoCodec && hint !== "audio" && VIDEO_EXT.has(ft.ext === "qt" ? "mov" : ft.ext)) {
      return { kind: "VIDEO", mime: ft.mime, ext: ft.ext === "qt" ? "mov" : ft.ext, probe: p };
    }
    if (p && p.hasAudio && !p.videoCodec && AUDIO_EXT.has(ft.ext)) {
      const mime =
        ft.ext === "webm"
          ? "audio/webm"
          : ft.ext === "mp4" || ft.ext === "m4a"
            ? "audio/mp4"
            : ft.mime;
      return { kind: "AUDIO", mime, ext: ft.ext === "mp4" ? "m4a" : ft.ext, probe: p };
    }
  }

  // "Foto ou vídeo" só aceita JPG/PNG/WEBP ou vídeo
  if (hint === "media") throw new Error(ERR.imageFormat);
  // Arquivo comum: guarda como veio (sempre baixado como anexo, nunca aberto no navegador)
  return {
    kind: "FILE",
    mime: ft?.mime ?? "application/octet-stream",
    ext: nameExt || ft?.ext || "",
  };
}

/** Foto: corrige rotação, remove EXIF/GPS, limita a 2560 px; miniatura WEBP de 600 px. */
export async function processImage(src: string, dest: string, thumbDest: string, ext: string) {
  const base = sharp(src, { failOn: "error" }).rotate();
  const resized = base.clone().resize(2560, 2560, { fit: "inside", withoutEnlargement: true });
  const out =
    ext === "png"
      ? resized.png()
      : ext === "webp"
        ? resized.webp({ quality: 86 })
        : resized.jpeg({ quality: 86, mozjpeg: true });
  const info = await out.toFile(dest); // sharp não copia metadados se não pedir
  await base
    .clone()
    .resize(600, 600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(thumbDest);
  return { width: info.width, height: info.height };
}

/** Capa do vídeo no segundo 1 (ou no início, se for mais curto). */
export async function videoPoster(src: string, dest: string, durationSec: number | null) {
  const at = durationSec && durationSec > 1 ? "1" : "0";
  const tmp = `${dest}.jpg`;
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-ss",
      at,
      "-i",
      src,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(900,iw)':-2",
      tmp,
    ],
    { timeout: 60_000 },
  );
  await sharp(tmp).webp({ quality: 76 }).toFile(dest);
  await unlink(tmp).catch(() => undefined);
}

export function needsTranscode(p: Probe) {
  return !!p.videoCodec && !PLAYABLE_VIDEO.has(p.videoCodec);
}

/** HEVC (iPhone) e outros → MP4 H.264/AAC, até 1080p (DECISOES §12). */
export async function transcodeToH264(src: string, dest: string) {
  const tmp = `${dest}.part.mp4`;
  await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      src,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-vf",
      "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tmp,
    ],
    { timeout: 30 * 60_000 },
  );
  await rename(tmp, dest);
  return (await stat(dest)).size;
}

/**
 * Áudio gravado no navegador (MediaRecorder) vem sem duração no cabeçalho. Remonta o
 * arquivo sem recodificar (-c copy), o que grava a duração certa para os players.
 */
export async function remuxAudio(src: string, dest: string) {
  const tmp = `${dest}.part${path.extname(dest)}`;
  await run("ffmpeg", ["-v", "error", "-y", "-i", src, "-map", "0:a:0", "-c", "copy", tmp], {
    timeout: 120_000,
  });
  await rename(tmp, dest);
}
