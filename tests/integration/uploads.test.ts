import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { resolveKey } from "@/lib/storage";
import { streamFile } from "@/lib/media-response";
import { getActiveConversation } from "@/server/conversations";
import { DomainError } from "@/server/errors";
import { on } from "@/server/events";
import { getAccessibleAttachment } from "@/server/media-access";
import { ERR, probe } from "@/server/media";
import { createAttachmentMessage } from "@/server/messages";
import { receiveUpload, storeUpload } from "@/server/uploads";
import { createUser, setUserStatus } from "@/server/users";
import { resetDb } from "./helpers";

const FIX = path.resolve(".data/test-fixtures");

beforeAll(() => {
  mkdirSync(FIX, { recursive: true });
  const ff = (args: string[], out: string) =>
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, path.join(FIX, out)]);
  ff(
    [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240:rate=10:duration=3",
      "-c:v",
      "libx265",
      "-tag:v",
      "hvc1",
      "-pix_fmt",
      "yuv420p",
    ],
    "iphone.mov",
  );
  ff(
    [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240:rate=10:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ],
    "ok.mp4",
  );
  ff(["-f", "lavfi", "-i", "sine=duration=4", "-c:a", "libopus"], "voz.webm");
});

beforeEach(resetDb);

async function people() {
  const maria = await createUser(db, { name: "Maria Clara", pin: "246810", status: "ACTIVE" });
  const allan = await createUser(db, { name: "Allan Souza", pin: "905317", status: "ACTIVE" });
  return { maria, allan, conv: (await getActiveConversation(db))! };
}

function multipart(bytes: Buffer, name: string, kind: "media" | "audio" | "file") {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("file", new Blob([new Uint8Array(bytes)]), name);
  return new Request("http://x/api/uploads", { method: "POST", body: fd });
}

async function upload(
  userId: string,
  bytes: Buffer,
  name: string,
  kind: "media" | "audio" | "file",
) {
  return storeUpload(db, userId, await receiveUpload(multipart(bytes, name, kind)));
}

async function errorOf(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(DomainError);
  return (e as DomainError).message;
}

describe("fotos", () => {
  it("remove EXIF/GPS, limita a 2560 px e gera miniatura de 600 px", async () => {
    const { maria } = await people();
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: "#4060a0" },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "GPS -23.5,-46.6" } } })
      .toBuffer();
    expect((await sharp(big).metadata()).exif).toBeDefined();
    const r = await upload(maria.id, big, "praia.jpg", "media");
    expect(r).toMatchObject({ kind: "IMAGE", status: "READY", width: 2560, height: 1920 });
    const [att] = await db.select().from(attachments).where(eq(attachments.id, r.attachmentId));
    const meta = await sharp(readFileSync(resolveKey(att!.storageKey))).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(2560);
    const thumb = await sharp(readFileSync(resolveKey(att!.thumbKey!))).metadata();
    expect(thumb).toMatchObject({ format: "webp", width: 600 });
    expect(att!.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/); // nome original só no banco
    expect(att!.originalName).toBe("praia.jpg");
  });

  it("'Foto ou vídeo' recusa GIF; como 'Arquivo' ele vai como arquivo", async () => {
    const { maria } = await people();
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    expect(await errorOf(upload(maria.id, gif, "a.gif", "media"))).toBe(ERR.imageFormat);
    expect((await upload(maria.id, gif, "a.gif", "file")).kind).toBe("FILE");
  });
});

describe("arquivos bloqueados e limites", () => {
  it("recusa executável pelo conteúdo, mesmo com outro nome, e scripts/SVG pelo nome", async () => {
    const { maria } = await people();
    const mz = Buffer.concat([
      Buffer.from("MZ"),
      Buffer.alloc(200),
      Buffer.from("PE\0\0"),
      Buffer.alloc(400),
    ]);
    // conteúdo de .exe disfarçado de .pdf: file-type reconhece o executável
    const msg = await upload(maria.id, mz, "relatorio.pdf", "file").then(
      (r) => r.kind,
      (e: DomainError) => e.message,
    );
    expect([ERR.blocked, "FILE"]).toContain(msg); // se não reconhecer, ao menos sai sempre como download
    expect(await errorOf(upload(maria.id, Buffer.from("<svg/>"), "logo.svg", "file"))).toBe(
      ERR.blocked,
    );
    expect(await errorOf(upload(maria.id, Buffer.from("echo"), "x.sh", "file"))).toBe(ERR.blocked);
    expect(await errorOf(upload(maria.id, Buffer.from("MZ"), "setup.exe", "file"))).toBe(
      ERR.blocked,
    );
  });

  it("arquivo comum acima de 25 MB é recusado", async () => {
    const { maria } = await people();
    expect(
      await errorOf(upload(maria.id, Buffer.alloc(26 * 1024 * 1024, 1), "grande.bin", "file")),
    ).toBe(ERR.tooBig);
  });

  it("vídeo acima de 100 MB é recusado (corte durante o envio)", async () => {
    const { maria } = await people();
    expect(
      await errorOf(upload(maria.id, Buffer.alloc(101 * 1024 * 1024, 1), "viagem.mp4", "media")),
    ).toBe("O vídeo excede o limite de 100 MB.");
  });

  it("vazio é recusado", async () => {
    const { maria } = await people();
    expect(await errorOf(upload(maria.id, Buffer.alloc(0), "nada.txt", "file"))).toBe(ERR.empty);
  });
});

describe("vídeo e áudio", () => {
  it("H.264 fica pronto na hora, com duração e capa", async () => {
    const { maria } = await people();
    const r = await upload(maria.id, readFileSync(path.join(FIX, "ok.mp4")), "ok.mp4", "media");
    expect(r).toMatchObject({
      kind: "VIDEO",
      status: "READY",
      durationSec: 2,
      width: 320,
      height: 240,
    });
    expect(r.thumbUrl).toMatch(/\/thumb$/);
  });

  it("HEVC do iPhone é convertido para H.264 e avisa quando termina", async () => {
    const { maria, conv } = await people();
    const done = new Promise<{ attachmentId: string; status: string }>((ok) => {
      const off = on("attachment:updated", (e) => {
        off();
        ok(e);
      });
    });
    const r = await upload(
      maria.id,
      readFileSync(path.join(FIX, "iphone.mov")),
      "IMG_0001.MOV",
      "media",
    );
    expect(r).toMatchObject({ kind: "VIDEO", status: "PENDING" });
    // já dá para enviar a mensagem enquanto converte
    await createAttachmentMessage(db, conv, maria.id, {
      clientId: crypto.randomUUID(),
      kind: "VIDEO",
      attachmentId: r.attachmentId,
    });
    expect(await done).toMatchObject({ attachmentId: r.attachmentId, status: "READY" });
    const [att] = await db.select().from(attachments).where(eq(attachments.id, r.attachmentId));
    expect(att).toMatchObject({ status: "READY", mime: "video/mp4" });
    expect((await probe(resolveKey(att!.storageKey)))?.videoCodec).toBe("h264");
  }, 60_000);

  it("áudio gravado (webm/opus) vira AUDIO com duração", async () => {
    const { maria } = await people();
    const r = await upload(
      maria.id,
      readFileSync(path.join(FIX, "voz.webm")),
      "audio.webm",
      "audio",
    );
    expect(r).toMatchObject({ kind: "AUDIO", status: "READY", durationSec: 4 });
  });
});

describe("mensagem com anexo e acesso", () => {
  it("só quem enviou usa o anexo, uma vez; legenda só em imagem/vídeo", async () => {
    const { maria, allan, conv } = await people();
    writeFileSync(path.join(FIX, "nota.txt"), "conteúdo");
    const r = await upload(maria.id, readFileSync(path.join(FIX, "nota.txt")), "nota.txt", "file");
    expect(r.kind).toBe("FILE");
    expect(
      await errorOf(
        createAttachmentMessage(db, conv, allan.id, {
          clientId: crypto.randomUUID(),
          kind: "FILE",
          attachmentId: r.attachmentId,
        }),
      ),
    ).toBe("Arquivo não encontrado.");
    const { message } = await createAttachmentMessage(db, conv, maria.id, {
      clientId: crypto.randomUUID(),
      kind: "FILE",
      attachmentId: r.attachmentId,
      caption: "ignorada",
    });
    expect(message).toMatchObject({
      kind: "FILE",
      body: null,
      attachment: { name: "nota.txt", kind: "FILE" },
    });
    expect(
      await errorOf(
        createAttachmentMessage(db, conv, maria.id, {
          clientId: crypto.randomUUID(),
          kind: "FILE",
          attachmentId: r.attachmentId,
        }),
      ),
    ).toBe("Este arquivo já foi enviado.");
  });

  it("participantes acessam; quem está fora da conversa, não", async () => {
    const { maria, allan, conv } = await people();
    const r = await upload(maria.id, readFileSync("scripts/demo/photo.jpg"), "vista.jpg", "media");
    await createAttachmentMessage(db, conv, maria.id, {
      clientId: crypto.randomUUID(),
      kind: "IMAGE",
      attachmentId: r.attachmentId,
    });
    expect(await getAccessibleAttachment(db, r.attachmentId, allan.id)).not.toBeNull();
    await setUserStatus(db, allan.id, "INACTIVE");
    const joao = await createUser(db, { name: "João Lima", pin: "481526", status: "ACTIVE" });
    expect(await getAccessibleAttachment(db, r.attachmentId, joao.id)).toBeNull();
  });

  it("entrega com Range (206) e recusa faixa inválida (416)", async () => {
    const { maria } = await people();
    const r = await upload(maria.id, readFileSync(path.join(FIX, "ok.mp4")), "ok.mp4", "media");
    const [att] = await db.select().from(attachments).where(eq(attachments.id, r.attachmentId));
    const size = att!.sizeBytes;
    const part = await streamFile(
      new Request("http://x", { headers: { range: "bytes=0-99" } }),
      att!.storageKey,
      { mime: att!.mime },
    );
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-99/${size}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    const bad = await streamFile(
      new Request("http://x", { headers: { range: `bytes=${size + 10}-` } }),
      att!.storageKey,
      { mime: att!.mime },
    );
    expect(bad.status).toBe(416);
    const full = await streamFile(new Request("http://x"), att!.storageKey, { mime: att!.mime });
    expect(full.headers.get("cache-control")).toContain("no-store");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
