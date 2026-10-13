import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat/ChatApp";
import { getCurrentSession } from "@/lib/auth/user-session";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

/** README §4.3 — Conversa + §4.4 — Sessão bloqueada. */
export default async function ChatPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");
  const { name, slug, tone, avatarUrl } = session.user;
  return <ChatApp name={name} slug={slug} tone={tone} avatarUrl={avatarUrl} />;
}
