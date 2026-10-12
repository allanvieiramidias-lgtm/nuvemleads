import { db } from "@/db";
import { apiError, json } from "@/lib/http";
import { getPublicProfile, LINK_INVALID } from "@/server/participant-auth";

/** Dados da tela de PIN: primeiro nome, iniciais, tom e foto. 404 se inativo (ARQUITETURA §5). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const profile = await getPublicProfile(db, (await params).slug);
  if (!profile) return apiError("NOT_FOUND", LINK_INVALID);
  const { firstName, initials, tone, avatarUrl, pinChangedByAdmin } = profile;
  return json({ firstName, initials, tone, avatarUrl, pinChangedByAdmin });
}
