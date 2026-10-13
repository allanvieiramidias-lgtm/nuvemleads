import { disposition, streamFile } from "@/lib/media-response";
import { mediaRoute } from "@/lib/media-route";

/** Arquivo do anexo (com Range). Arquivos comuns sempre como download, nunca abertos no navegador. */
export const GET = mediaRoute(async (req, att) => {
  const inline = att.kind === "IMAGE" || att.kind === "VIDEO" || att.kind === "AUDIO";
  return streamFile(req, att.storageKey, {
    mime: inline ? att.mime : "application/octet-stream",
    disposition: disposition(inline ? "inline" : "attachment", att.originalName),
  });
});
