import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat/ChatApp";
import { getCurrentSession } from "@/lib/auth/user-session";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

/** README §4.3 — Conversa. O bloqueio completo (tela "Sessão bloqueada") chega na Etapa 8. */
export default async function ChatPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");
  return <ChatApp name={session.user.name} slug={session.user.slug} />;
}
