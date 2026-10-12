import { z } from "zod";
import { db } from "@/db";
import {
  LAST_SLUG_COOKIE,
  USER_COOKIE,
  lastSlugCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { clientIp, forbiddenOrigin, handleError, isSameOrigin, json, readJson } from "@/lib/http";
import { loginWithPin } from "@/server/participant-auth";

const Body = z.object({ slug: z.string().max(60), pin: z.string().max(12) });

/** POST { slug, pin } → sessão. 401 INVALID_PIN { attemptsLeft } · 429 TOO_MANY { retryAfter }. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const { slug, pin } = await readJson(req, Body);
    const { token, expiresAt } = await loginWithPin(db, { slug, pin, ip: clientIp(req) });
    const res = json({ ok: true });
    res.cookies.set(
      USER_COOKIE,
      token,
      sessionCookieOptions(Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    );
    res.cookies.set(LAST_SLUG_COOKIE, slug, lastSlugCookieOptions());
    return res;
  } catch (err) {
    return handleError(err);
  }
}
