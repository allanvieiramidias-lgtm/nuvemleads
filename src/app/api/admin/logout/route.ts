import { cookies } from "next/headers";
import { db } from "@/db";
import { ADMIN_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { forbiddenOrigin, handleError, isSameOrigin, json } from "@/lib/http";
import { logoutAdmin } from "@/server/admin-auth";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const store = await cookies();
    await logoutAdmin(db, store.get(ADMIN_COOKIE)?.value);
    const res = json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, "", sessionCookieOptions(0));
    return res;
  } catch (err) {
    return handleError(err);
  }
}
