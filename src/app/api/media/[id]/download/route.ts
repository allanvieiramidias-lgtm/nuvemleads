import { disposition, streamFile } from "@/lib/media-response";
import { mediaRoute } from "@/lib/media-route";

/** Baixar: Content-Disposition attachment com o nome original (ARQUITETURA §5). */
export const GET = mediaRoute(
  async (req, att) =>
    streamFile(req, att.storageKey, {
      mime: "application/octet-stream",
      disposition: disposition("attachment", att.originalName),
    }),
  "download",
);
