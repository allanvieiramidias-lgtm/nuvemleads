import { z } from "zod";
import { db } from "@/db";
import { ADMIN_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { clientIp, forbiddenOrigin, handleError, isSameOrigin, json, readJson } from "@/lib/http";
import { ADMIN_LOGIN_ERROR, loginAdmin } from "@/server/admin-auth";
import { DomainError } from "@/server/errors";

const Body = z.object({ email: z.string().max(200), password: z.string().max(200) });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const body = await readJson(req, Body).catch(() => {
      // corpo inválido recebe a mesma mensagem genérica
      throw new DomainError("FORBIDDEN", ADMIN_LOGIN_ERROR);
    });
    const { token, expiresAt, admin } = await loginAdmin(db, {
      ...body,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    const res = json({ admin: { name: admin.name, email: admin.email } });
    res.cookies.set(
      ADMIN_COOKIE,
      token,
      sessionCookieOptions(Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    );
    return res;
  } catch (err) {
    return handleError(err);
  }
}
