import { db } from "@/db";
import { chatRoute } from "@/lib/chat-api";
import { json } from "@/lib/http";
import { receiveUpload, storeUpload } from "@/server/uploads";

/** multipart/form-data (campo `file` + `kind`), até 25 MB (vídeo 100 MB), por streaming. */
export const POST = chatRoute(async (req, { session }) => {
  const up = await receiveUpload(req);
  return json(await storeUpload(db, session.user.id, up), { status: 201 });
});
