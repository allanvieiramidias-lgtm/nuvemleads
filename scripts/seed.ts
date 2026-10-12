// Seed: Settings padrão + admin (ADMIN_SEED_*). Com SEED_DEMO=true, cria Maria Clara e Allan Souza
// com as 9 mensagens do protótipo (README §7). Pode rodar mais de uma vez sem duplicar nada.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { access, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { admins, attachments, messages, settings, users } from "../src/db/schema";
import { hashSecret } from "../src/lib/auth/hash";
import { newSlug } from "../src/lib/auth/tokens";
import { ensureDirFor, storageKeyFor } from "../src/lib/storage";
import { getOrCreateConversation } from "../src/server/conversations";

const isProd = process.env.NODE_ENV === "production";
const here = path.dirname(fileURLToPath(import.meta.url));

function fail(msg: string): never {
  console.error(`Seed interrompido: ${msg}`);
  process.exit(1);
}

async function seedSettings() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
}

async function seedAdmin() {
  const name = process.env.ADMIN_SEED_NAME?.trim();
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD ?? "";
  if (!name || !email) fail("defina ADMIN_SEED_NAME e ADMIN_SEED_EMAIL.");
  if (password.length < 10) fail("ADMIN_SEED_PASSWORD precisa ter pelo menos 10 caracteres.");
  if (isProd && password === "trocar-no-primeiro-acesso")
    fail("troque ADMIN_SEED_PASSWORD antes de rodar em produção.");

  const [existing] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email));
  if (existing) {
    console.log(`Admin ${email} já existe (senha mantida).`);
    return;
  }
  await db.insert(admins).values({ name, email, passwordHash: await hashSecret(password) });
  console.log(`Admin ${email} criado.`);
}

// ── Demonstração ────────────────────────────────────────────────────────

/** Horário de Brasília (UTC−3, sem horário de verão desde 2019). */
function brt(dayOffset: number, hhmm: string): Date {
  const now = new Date();
  const local = new Date(now.getTime() - 3 * 3600_000);
  const [h, m] = hhmm.split(":").map(Number);
  const d = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + dayOffset,
    h! + 3,
    m!,
  );
  return new Date(d);
}

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** PDF mínimo válido de uma página. */
function tinyPdf(title: string): Buffer {
  const text = `BT /F1 18 Tf 72 720 Td (${title}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

type MediaSpec = {
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  originalName: string;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
  durationSec?: number;
  /** Escreve o arquivo no caminho absoluto; retorna false se não deu para gerar. */
  write: (absPath: string) => Promise<boolean>;
  /** Capa (vídeo) / miniatura (imagem). */
  thumbFrom?: string;
};

async function createAttachment(uploaderId: string, spec: MediaSpec, at: Date) {
  const id = crypto.randomUUID();
  const storageKey = storageKeyFor(id, spec.ext, at);
  const abs = await ensureDirFor(storageKey);
  const ok = await spec.write(abs);
  let thumbKey: string | null = null;
  if (spec.thumbFrom) {
    thumbKey = storageKeyFor(`${id}-thumb`, "jpg", at);
    await copyFile(spec.thumbFrom, await ensureDirFor(thumbKey));
  }
  const { size } = ok ? await import("node:fs/promises").then((fs) => fs.stat(abs)) : { size: 0 };
  const [row] = await db
    .insert(attachments)
    .values({
      id,
      uploaderId,
      kind: spec.kind,
      storageKey,
      thumbKey,
      mime: spec.mime,
      sizeBytes: size,
      originalName: spec.originalName,
      width: spec.width ?? null,
      height: spec.height ?? null,
      durationSec: spec.durationSec ?? null,
      status: ok ? "READY" : "FAILED",
      createdAt: at,
    })
    .returning();
  return row!;
}

/** A foto fica em scripts/demo; rodando de dist/, sobe uma pasta. */
async function findDemoPhoto(): Promise<string> {
  for (const p of [
    path.join(here, "demo", "photo.jpg"),
    path.join(here, "..", "scripts", "demo", "photo.jpg"),
  ]) {
    try {
      await access(p);
      return p;
    } catch {
      /* tenta o próximo */
    }
  }
  fail("foto de demonstração não encontrada em scripts/demo/photo.jpg.");
}

async function seedDemo() {
  if (isProd)
    fail("SEED_DEMO=true não pode rodar em produção (os PINs de exemplo não podem existir lá).");
  // Confere tudo antes de gravar, para não deixar a demonstração pela metade.
  const photo = await findDemoPhoto();

  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (anyUser) {
    console.log("Já existem usuários; dados de demonstração não foram recriados.");
    return;
  }

  // PINs de demonstração do protótipo (README §2). 123456 seria recusado pelo formulário;
  // o seed grava direto por ser só para desenvolvimento.
  const [maria] = await db
    .insert(users)
    .values({
      name: "Maria Clara",
      tone: "ACCENT",
      slug: newSlug(),
      pinHash: await hashSecret("123456"),
    })
    .returning();
  const [allan] = await db
    .insert(users)
    .values({
      name: "Allan Souza",
      tone: "NEUTRAL",
      slug: newSlug(),
      pinHash: await hashSecret("246810"),
    })
    .returning();
  const conv = await getOrCreateConversation(db, maria!.id, allan!.id);

  const ffmpeg = hasFfmpeg();
  if (!ffmpeg)
    console.log("ffmpeg não encontrado: áudio e vídeo de exemplo ficam como falha de envio.");

  const run = (args: string[]) => async (out: string) => {
    if (!ffmpeg) return false;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, out]);
    return true;
  };

  type Seed = {
    from: "maria" | "allan";
    day: -1 | 0;
    time: string;
    text?: string;
    media?: MediaSpec;
  };
  const seed: Seed[] = [
    { from: "maria", day: -1, time: "18:02", text: "Chegou o contrato revisado?" },
    { from: "allan", day: -1, time: "18:05", text: "Chegou sim. Vou ler com calma hoje à noite." },
    {
      from: "allan",
      day: -1,
      time: "18:05",
      media: {
        kind: "FILE",
        originalName: "Contrato_revisado_v3.pdf",
        mime: "application/pdf",
        ext: "pdf",
        write: async (out) => (await writeFile(out, tinyPdf("Contrato revisado v3")), true),
      },
    },
    {
      from: "maria",
      day: -1,
      time: "18:20",
      media: {
        kind: "AUDIO",
        originalName: "audio.webm",
        mime: "audio/webm",
        ext: "webm",
        durationSec: 42,
        write: run([
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=330:duration=42",
          "-c:a",
          "libopus",
          "-b:a",
          "24k",
        ]),
      },
    },
    {
      from: "maria",
      day: 0,
      time: "09:14",
      text: "A vista daqui de cima",
      media: {
        kind: "IMAGE",
        originalName: "vista.jpg",
        mime: "image/jpeg",
        ext: "jpg",
        write: async (out) => (await copyFile(photo, out), true),
        thumbFrom: photo,
      },
    },
    { from: "maria", day: 0, time: "09:15", text: "Consegue me mandar o vídeo de ontem?" },
    {
      from: "allan",
      day: 0,
      time: "09:31",
      media: {
        kind: "VIDEO",
        originalName: "ontem.mp4",
        mime: "video/mp4",
        ext: "mp4",
        width: 640,
        height: 400,
        durationSec: 88,
        write: run([
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x400:rate=15:duration=88",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=220:duration=88",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "34",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "48k",
          "-shortest",
          "-movflags",
          "+faststart",
        ]),
        thumbFrom: photo,
      },
    },
    { from: "allan", day: 0, time: "09:31", text: "Aqui está. Ficou um pouco escuro no final." },
    { from: "maria", day: 0, time: "09:40", text: "Perfeito, obrigada." },
  ];

  let lastAt = new Date(0);
  for (const m of seed) {
    const sender = m.from === "maria" ? maria! : allan!;
    // mensagens no mesmo minuto ficam em ordem (+1 s)
    let at = brt(m.day, m.time);
    if (at <= lastAt) at = new Date(lastAt.getTime() + 1000);
    lastAt = at;
    const att = m.media ? await createAttachment(sender.id, m.media, at) : null;
    // "lida" nas enviadas por Allan, como no protótipo; as de Maria hoje ainda não lidas
    const read = m.from === "allan" || m.day === -1;
    await db.insert(messages).values({
      conversationId: conv.id,
      clientId: crypto.randomUUID(),
      senderId: sender.id,
      kind: att ? att.kind : "TEXT",
      body: m.text ?? null,
      attachmentId: att?.id ?? null,
      createdAt: at,
      deliveredAt: at,
      readAt: read ? new Date(at.getTime() + 60_000) : null,
    });
  }
  await db
    .update(users)
    .set({ lastActiveAt: brt(0, "09:40") })
    .where(eq(users.id, maria!.id));
  await db
    .update(users)
    .set({ lastActiveAt: brt(0, "09:31") })
    .where(eq(users.id, allan!.id));

  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log("Demonstração criada:");
  console.log(`  Maria Clara  PIN 123456  ${base}/u/${maria!.slug}`);
  console.log(`  Allan Souza  PIN 246810  ${base}/u/${allan!.slug}`);
}

await seedSettings();
await seedAdmin();
if (process.env.SEED_DEMO === "true") await seedDemo();
await pool.end();
console.log("Seed concluído.");
