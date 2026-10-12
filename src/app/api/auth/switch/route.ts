import { LAST_SLUG_COOKIE, lastSlugCookieOptions } from "@/lib/auth/cookies";
import { forbiddenOrigin, isSameOrigin, json } from "@/lib/http";

/** "Não é você? Trocar": esquece o link lembrado neste navegador. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const res = json({ ok: true });
  res.cookies.set(LAST_SLUG_COOKIE, "", { ...lastSlugCookieOptions(), maxAge: 0 });
  return res;
}
