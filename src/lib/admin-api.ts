import { cookies } from "next/headers";
import { db } from "@/db";
import { ADMIN_COOKIE } from "@/lib/auth/cookies";
import { apiError, forbiddenOrigin, handleError, isSameOrigin } from "@/lib/http";
import { getAdminByToken, type AdminProfile } from "@/server/admin-auth";
import { avatarUrl } from "@/server/avatars";
import type { PublicUser } from "@/server/users";

type Ctx<P> = { admin: AdminProfile; token: string; params: P };

/**
 * Envolve uma rota do admin: exige sessão válida, checa Origin nas mutações
 * e converte erros em respostas padronizadas.
 */
export function adminRoute<P = Record<string, never>>(
  handler: (req: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    if (req.method !== "GET" && !isSameOrigin(req)) return forbiddenOrigin();
    try {
      const token = (await cookies()).get(ADMIN_COOKIE)?.value;
      const admin = await getAdminByToken(db, token);
      if (!admin || !token) return apiError("FORBIDDEN", "Sessão expirada. Entre novamente.");
      return await handler(req, { admin, token, params: await routeCtx.params });
    } catch (err) {
      return handleError(err);
    }
  };
}

/** Formato do usuário nas respostas do admin. */
export function userDto(u: PublicUser) {
  return {
    id: u.id,
    name: u.name,
    tone: u.tone,
    status: u.status,
    slug: u.slug,
    avatarUrl: avatarUrl(u.avatarKey),
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
export type UserDto = ReturnType<typeof userDto>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);
