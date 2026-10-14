import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import {
  DEVICE_COOKIE,
  LAST_SLUG_COOKIE,
  USER_COOKIE,
  deviceCookieOptions,
  lastSlugCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { clientIp, forbiddenOrigin, handleError, isSameOrigin, json, readJson } from "@/lib/http";
import { rememberDevice } from "@/server/devices";
import { loginWithPin } from "@/server/participant-auth";

// Pelo link pessoal ({ slug, pin }) ou pela página principal ({ username, pin }) — DECISOES §29.
const Body = z.union([
  z.object({ slug: z.string().max(60), pin: z.string().max(12) }),
  z.object({ username: z.string().max(60), pin: z.string().max(12) }),
]);

/**
 * POST → sessão + aparelho lembrado por 180 dias.
 * 401 INVALID_PIN { attemptsLeft } · 429 TOO_MANY { retryAfter } · 404 link inválido.
 * Usuário inexistente responde igual a PIN errado.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const body = await readJson(req, Body);
    const ip = clientIp(req);
    const result = await loginWithPin(
      db,
      "username" in body
        ? { username: body.username, pin: body.pin, ip }
        : { slug: body.slug, pin: body.pin, ip },
    );
    const deviceToken = await rememberDevice(db, {
      userId: result.userId,
      pinVersion: result.pinVersion,
      currentToken: (await cookies()).get(DEVICE_COOKIE)?.value,
    });
    const res = json({ ok: true });
    res.cookies.set(
      USER_COOKIE,
      result.token,
      sessionCookieOptions(Math.floor((result.expiresAt.getTime() - Date.now()) / 1000)),
    );
    res.cookies.set(LAST_SLUG_COOKIE, result.slug, lastSlugCookieOptions());
    res.cookies.set(DEVICE_COOKIE, deviceToken, deviceCookieOptions());
    return res;
  } catch (err) {
    return handleError(err);
  }
}
