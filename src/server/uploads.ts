import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { attachments, messages } from "@/db/schema";
import { ensureDirFor, resolveKey, storageKeyFor, uploadRoot } from "@/lib/storage";
import { DomainError } from "./errors";
import { emit } from "./events";
import {
  classify,
  ERR,
  isBlockedName,
  maxUploadBytes,
  maxVideoBytes,
  needsTranscode,
  probe,
  processImage,
  remuxAudio,
  transcodeToH264,
  videoPoster,
} from "./media";

export type UploadResult = {
  attachmentId: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  status: "PENDING" | "READY";
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumbUrl: string | null;
};

class TooBig extends Error {}

/**
 * Recebe o arquivo por streaming direto para o disco, contando os bytes e abortando
 * no limite (DECISOES §12) — nada de carregar 100 MB na memória.
 */
export async function receiveUpload(
  req: Request,
): Promise<{ tmp: string; name: string; size: number; hint: "media" | "audio" | "file" }> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data") || !req.body)
    throw new DomainError("VALIDATION", "Envio inválido.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxVideoBytes() + MB_SLACK) throw new DomainError("VALIDATION", ERR.videoTooBig);

  const tmpDir = path.join(uploadRoot(), "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, crypto.randomUUID());
  const bb = Busboy({
    headers: { "content-type": type },
    limits: { files: 1, fileSize: maxVideoBytes(), fields: 4 },
  });

  let name = "arquivo";
  let hint: "media" | "audio" | "file" = "file";
  let size = 0;
  let gotFile = false;
  let writing: Promise<void> | null = null;

  const done = new Promise<void>((resolve, reject) => {
    bb.on("field", (k, v) => {
      if (k === "kind" && (v === "media" || v === "audio" || v === "file")) hint = v;
    });
    bb.on("file", (field, stream, info) => {
      if (field !== "file" || gotFile) return void stream.resume();
      gotFile = true;
      name = (info.filename || "arquivo").replace(/[\\/\0]/g, "_").slice(0, 180);
      stream.on("data", (c: Buffer) => (size += c.length));
      stream.on("limit", () => reject(new TooBig()));
      writing = pipeline(stream, createWriteStream(tmp));
      writing.catch(reject);
    });
    bb.on("error", reject);
    bb.on("close", () => (writing ?? Promise.resolve()).then(resolve, reject));
  });

  try {
    await pipeline(Readable.fromWeb(req.body as import("stream/web").ReadableStream), bb);
    await done;
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    if (e instanceof TooBig) throw new DomainError("VALIDATION", ERR.videoTooBig);
    throw e instanceof DomainError
      ? e
      : new DomainError("VALIDATION", "Não foi possível receber o arquivo.");
  }
  if (!gotFile || size === 0) {
    await unlink(tmp).catch(() => undefined);
    throw new DomainError("VALIDATION", ERR.empty);
  }
  return { tmp, name, size, hint };
}
const MB_SLACK = 1024 * 1024;

/** Classifica, processa e grava o anexo (status READY, ou PENDING se o vídeo precisa converter). */
export async function storeUpload(
  db: Db,
  uploaderId: string,
  up: { tmp: string; name: string; size: number; hint: "media" | "audio" | "file" },
): Promise<UploadResult> {
  try {
    if (isBlockedName(up.name)) throw new DomainError("VALIDATION", ERR.blocked);
    let c;
    try {
      c = await classify(up.tmp, up.name, up.hint);
    } catch (e) {
      throw new DomainError("VALIDATION", e instanceof Error ? e.message : ERR.blocked);
    }
    if (c.kind !== "VIDEO" && up.size > maxUploadBytes())
      throw new DomainError("VALIDATION", ERR.tooBig);

    const id = crypto.randomUUID();
    const now = new Date();
    const storageKey = storageKeyFor(id, c.ext, now);
    const dest = await ensureDirFor(storageKey);
    let thumbKey: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let durationSec: number | null = null;
    let status: "PENDING" | "READY" = "READY";
    let sizeBytes = up.size;

    if (c.kind === "IMAGE") {
      thumbKey = storageKeyFor(`${id}-thumb`, "webp", now);
      try {
        ({ width, height } = await processImage(up.tmp, dest, await ensureDirFor(thumbKey), c.ext));
      } catch {
        throw new DomainError("VALIDATION", ERR.imageFormat);
      }
      sizeBytes = (await stat(dest)).size;
    } else if (c.kind === "AUDIO") {
      try {
        await remuxAudio(up.tmp, dest);
      } catch {
        await rename(up.tmp, dest); // se não der para remontar, guarda como veio
      }
      const p = (await probe(dest)) ?? c.probe;
      durationSec = p.durationSec ?? c.probe.durationSec;
      sizeBytes = (await stat(dest)).size;
    } else {
      await rename(up.tmp, dest);
      if (c.kind === "VIDEO") {
        durationSec = c.probe.durationSec;
        width = c.probe.width;
        height = c.probe.height;
      }
      if (c.kind === "VIDEO") {
        thumbKey = storageKeyFor(`${id}-thumb`, "webp", now);
        await videoPoster(dest, await ensureDirFor(thumbKey), durationSec).catch(
          () => (thumbKey = null),
        );
        if (needsTranscode(c.probe)) status = "PENDING";
      }
    }

    await db.insert(attachments).values({
      id,
      uploaderId,
      kind: c.kind,
      storageKey,
      thumbKey,
      mime: c.mime,
      sizeBytes,
      originalName: up.name,
      width,
      height,
      durationSec,
      status,
    });
    if (status === "PENDING") enqueueTranscode(db, id);
    return {
      attachmentId: id,
      kind: c.kind,
      status,
      width,
      height,
      durationSec,
      thumbUrl: thumbKey ? `/api/media/${id}/thumb` : null,
    };
  } finally {
    await unlink(up.tmp).catch(() => undefined);
  }
}

// ── Conversão de vídeo: um por vez, no próprio processo ─────────────────
const g = globalThis as unknown as { nlTranscode?: { queue: string[]; running: boolean } };
const tq = (g.nlTranscode ??= { queue: [], running: false });

export function enqueueTranscode(db: Db, attachmentId: string) {
  tq.queue.push(attachmentId);
  void drain(db);
}

async function drain(db: Db) {
  if (tq.running) return;
  tq.running = true;
  try {
    while (tq.queue.length) {
      const id = tq.queue.shift()!;
      await transcodeOne(db, id).catch((e) => console.error("Falha ao converter vídeo", id, e));
    }
  } finally {
    tq.running = false;
  }
}

async function transcodeOne(db: Db, id: string) {
  const [att] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!att || att.status !== "PENDING") return;
  const newKey = att.storageKey.replace(/\.[a-z0-9]+$/, "") + "-h264.mp4";
  let status: "READY" | "FAILED" = "READY";
  let size = att.sizeBytes;
  try {
    size = await transcodeToH264(resolveKey(att.storageKey), await ensureDirFor(newKey));
    await rm(resolveKey(att.storageKey), { force: true });
  } catch {
    status = "FAILED";
  }
  await db
    .update(attachments)
    .set(
      status === "READY"
        ? { storageKey: newKey, mime: "video/mp4", sizeBytes: size, status }
        : { status },
    )
    .where(eq(attachments.id, id));
  const [msg] = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.attachmentId, id));
  emit("attachment:updated", {
    attachmentId: id,
    conversationId: msg?.conversationId ?? null,
    status,
  });
}
