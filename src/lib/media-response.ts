import { open, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolveKey } from "@/lib/storage";

const NO_STORE = "private, no-store";

/** Nome no Content-Disposition (RFC 5987) sem aspas/quebras. */
export function disposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Envia o arquivo com suporte a Range (vídeo e áudio pulam trechos). */
export async function streamFile(
  req: Request,
  key: string,
  opts: { mime: string; disposition?: string },
): Promise<Response> {
  // Abre antes de medir: se o arquivo for apagado no meio (visualização única fechada,
  // limpeza), quem já abriu termina de receber e quem chega depois recebe 404.
  let fh: FileHandle | null = null;
  let size: number;
  try {
    fh = await open(resolveKey(key), "r");
    size = (await fh.stat()).size;
  } catch {
    await fh?.close().catch(() => undefined);
    return new Response("Não encontrado", { status: 404, headers: { "Cache-Control": NO_STORE } });
  }
  const headers: Record<string, string> = {
    "Content-Type": opts.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": NO_STORE,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ...(opts.disposition ? { "Content-Disposition": opts.disposition } : {}),
  };
  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      await fh.close();
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    }
    const body = Readable.toWeb(fh.createReadStream({ start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  const body = Readable.toWeb(fh.createReadStream()) as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
