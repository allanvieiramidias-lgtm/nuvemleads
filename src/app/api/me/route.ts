import { db } from "@/db";
import { getCurrentSession } from "@/lib/auth/user-session";
import { apiError, json } from "@/lib/http";
import { getActiveConversation, otherParticipant } from "@/server/conversations";
import { getSettings } from "@/server/settings";
import { getUser } from "@/server/users";
import { avatarUrl } from "@/server/avatars";

/** Sessão, contato e configurações (ARQUITETURA §5). Presença em tempo real chega na Etapa 6. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return apiError("REVOKED", "Sessão encerrada. Digite seu PIN.");

  const conv = await getActiveConversation(db);
  const contactId = conv ? otherParticipant(conv, session.user.id) : null;
  const contact = contactId ? await getUser(db, contactId) : null;

  return json({
    session: {
      userId: session.user.id,
      name: session.user.name,
      slug: session.user.slug,
      tone: session.user.tone,
      avatarUrl: session.user.avatarUrl,
      locked: session.locked,
      lockReason: session.lockReason,
      lockedAt: session.lockedAt?.toISOString() ?? null,
    },
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          tone: contact.tone,
          avatarUrl: avatarUrl(contact.avatarKey),
          online: false,
          lastSeenAt: contact.lastActiveAt?.toISOString() ?? null,
        }
      : null,
    settings: await getSettings(db),
  });
}
