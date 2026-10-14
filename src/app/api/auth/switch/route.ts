import { cookies } from "next/headers";
import { db } from "@/db";
import {
  DEVICE_COOKIE,
  LAST_SLUG_COOKIE,
  deviceCookieOptions,
  lastSlugCookieOptions,
} from "@/lib/auth/cookies";
import { forbiddenOrigin, isSameOrigin, json } from "@/lib/http";
import { forgetDevice } from "@/server/devices";

/** "Não é você? Trocar": este navegador esquece a pessoa (link e aparelho lembrados). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  await forgetDevice(db, (await cookies()).get(DEVICE_COOKIE)?.value);
  const res = json({ ok: true });
  res.cookies.set(LAST_SLUG_COOKIE, "", { ...lastSlugCookieOptions(), maxAge: 0 });
  res.cookies.set(DEVICE_COOKIE, "", { ...deviceCookieOptions(), maxAge: 0 });
  return res;
}
