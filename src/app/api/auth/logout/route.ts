import { cookies } from "next/headers";
import { db } from "@/db";
import { USER_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { forbiddenOrigin, handleError, isSameOrigin, json } from "@/lib/http";
import { logoutSession } from "@/server/participant-auth";

/** "Encerrar sessão": apaga a sessão e o cookie. O link lembrado (nl_last) continua. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    await logoutSession(db, (await cookies()).get(USER_COOKIE)?.value);
    const res = json({ ok: true });
    res.cookies.set(USER_COOKIE, "", sessionCookieOptions(0));
    return res;
  } catch (err) {
    return handleError(err);
  }
}
