import { cookies } from "next/headers";
import { db } from "@/db";
import { getSessionByToken, type SessionInfo } from "@/server/participant-auth";
import { USER_COOKIE } from "./cookies";

/** Sessão da pessoa na requisição atual (Server Components e Route Handlers). */
export async function getCurrentSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  return getSessionByToken(db, store.get(USER_COOKIE)?.value);
}
