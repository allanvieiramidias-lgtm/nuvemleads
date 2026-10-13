import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
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
  const file = resolveKey(key);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
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
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    }
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
