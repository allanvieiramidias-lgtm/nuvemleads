import { z } from "zod";
import { db } from "@/db";
import { forbiddenOrigin, handleError, isSameOrigin, json, readJson } from "@/lib/http";
import { resetPassword } from "@/server/admin-auth";

const Body = z.object({ token: z.string().min(10).max(200), password: z.string().max(200) });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    await resetPassword(db, await readJson(req, Body));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
