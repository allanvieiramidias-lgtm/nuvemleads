import { cookies } from "next/headers";
import { db } from "@/db";
import { DEVICE_COOKIE } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, json } from "@/lib/http";
import { getDevice } from "@/server/devices";
import { getUnreadNotice } from "@/server/notice";

/**
 * GET → { enabled, unread } (DECISOES §29). Vale para a sessão deste aparelho mesmo
 * bloqueada (tela de bloqueio) ou para o aparelho lembrado (tela de PIN). Quem só tem o
 * link não recebe nada.
 */
export async function GET() {
  const session = await getCurrentSession();
  const userId =
    session?.user.id ?? (await getDevice(db, (await cookies()).get(DEVICE_COOKIE)?.value))?.userId;
  if (!userId) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");
  return json(await getUnreadNotice(db, userId));
}
