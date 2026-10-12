import { mkdir } from "node:fs/promises";
import path from "node:path";

/** Raiz do volume de uploads (fora da pasta pública; servido só por rota autenticada). */
export function uploadRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.UPLOAD_DIR ?? ".data/uploads",
  );
}

/** Chave relativa: AAAA/MM/<id>.<ext> — o nome original fica só no banco (ARQUITETURA §7). */
export function storageKeyFor(id: string, ext: string, date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const safeExt = ext
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return `${y}/${m}/${id}${safeExt ? `.${safeExt}` : ""}`;
}

/** Caminho absoluto de uma chave, recusando qualquer coisa que saia da raiz. */
export function resolveKey(key: string): string {
  const root = uploadRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Chave de arquivo inválida");
  return full;
}

export async function ensureDirFor(key: string): Promise<string> {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  return full;
}
