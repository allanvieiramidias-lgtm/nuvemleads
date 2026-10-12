import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/user-session";
import { ChatBoot } from "./ChatBoot";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

/** /chat — conversa (Etapa 6) + bloqueio (Etapa 8). Aqui só confere se há sessão válida. */
export default async function ChatPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");
  return <ChatBoot name={session.user.name} slug={session.user.slug} />;
}
