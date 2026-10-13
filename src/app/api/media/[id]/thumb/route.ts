import { apiError } from "@/lib/http";
import { streamFile } from "@/lib/media-response";
import { mediaRoute } from "@/lib/media-route";

/** Miniatura (imagem) ou capa (vídeo), sempre WEBP. */
export const GET = mediaRoute(async (req, att) => {
  if (!att.thumbKey) return apiError("NOT_FOUND", "Sem miniatura.");
  return streamFile(req, att.thumbKey, { mime: "image/webp" });
});
