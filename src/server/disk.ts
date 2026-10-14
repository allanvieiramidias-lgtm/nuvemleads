import { mkdir, statfs } from "node:fs/promises";
import { uploadRoot } from "@/lib/storage";

/** Espaço do disco onde ficam os anexos (o volume do servidor). */
export async function diskUsage(): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const root = uploadRoot();
    await mkdir(root, { recursive: true });
    const s = await statfs(root);
    return { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
  } catch {
    return null;
  }
}
