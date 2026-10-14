import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GateScreen } from "@/components/participant/GateScreen";
import { cookies } from "next/headers";
import { db } from "@/db";
import { DEVICE_COOKIE } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/user-session";
import { getDevice } from "@/server/devices";
import { getPublicProfile, LINK_INVALID } from "@/server/participant-auth";
import { PinGate } from "./PinGate";

export const metadata: Metadata = { title: "NuvemLeads", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** README §4.2 — PIN do usuário. */
export default async function PinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getCurrentSession();
  // Já com sessão desbloqueada desta pessoa: vai direto para a conversa.
  if (session && session.user.slug === slug && !session.locked) redirect("/chat");

  const profile = await getPublicProfile(db, slug);
  if (!profile) {
    return (
      <GateScreen width={340} gap={18}>
        <div>
          <h3 className="mb-1.5">Link inválido</h3>
          <p className="m-0 text-[14px] text-[var(--color-neutral-400)]">{LINK_INVALID}</p>
        </div>
        <div>
          <Link href="/" className="btn btn-ghost text-[13px] no-underline">
            Voltar ao início
          </Link>
        </div>
      </GateScreen>
    );
  }

  // Aparelho já desta pessoa (sessão bloqueada ou aparelho lembrado): mostra o aviso de
  // mensagens novas. Quem chega só com o link não vê nada (DECISOES §29).
  const device = await getDevice(db, (await cookies()).get(DEVICE_COOKIE)?.value);
  const remembered = session?.user.slug === slug || device?.slug === slug;

  return (
    <GateScreen width={340} gap={18}>
      <PinGate slug={slug} profile={profile} remembered={remembered} />
    </GateScreen>
  );
}
