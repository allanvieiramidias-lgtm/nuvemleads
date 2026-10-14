import { CaretRightIcon, ShieldCheckIcon, UserGearIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GateScreen } from "@/components/participant/GateScreen";
import { Avatar } from "@/components/ui/Avatar";
import { db } from "@/db";
import { DEVICE_COOKIE, LAST_SLUG_COOKIE } from "@/lib/auth/cookies";
import { getCurrentSession } from "@/lib/auth/user-session";
import { getDevice } from "@/server/devices";
import { getPublicProfile, listActiveForPicker } from "@/server/participant-auth";
import { UsernameGate } from "./UsernameGate";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

const adminLink = (
  <Link href="/admin/login" className="btn btn-ghost nl-muted-link text-[12.5px] no-underline">
    <UserGearIcon size={15} aria-hidden />
    Acesso administrativo
  </Link>
);

/** README §4.1 + DECISOES §13. */
export default async function AcessoPage() {
  if (await getCurrentSession()) redirect("/chat");

  const store = await cookies();
  // Aparelho lembrado (DECISOES §29): vai direto para a tela de PIN desta pessoa.
  const device = await getDevice(db, store.get(DEVICE_COOKIE)?.value);
  if (device) redirect(`/u/${device.slug}`);

  if (process.env.PUBLIC_PICKER !== "true") {
    const last = store.get(LAST_SLUG_COOKIE)?.value;
    if (last && (await getPublicProfile(db, last))) redirect(`/u/${last}`);
    // Entrada por usuário + PIN, sem mostrar quem existe (DECISOES §29).
    return (
      <GateScreen width={340} gap={18} footer={adminLink}>
        <UsernameGate />
        <div className="nl-note">
          <ShieldCheckIcon size={14} aria-hidden />A conversa é ocultada sempre que você sair da
          janela.
        </div>
      </GateScreen>
    );
  }

  const people = await listActiveForPicker(db);
  return (
    <GateScreen footer={adminLink}>
      <div>
        <h3 className="mb-1.5">Quem está acessando?</h3>
        <p className="m-0 text-[14px] text-[var(--color-neutral-500)]">
          Esta é uma conversa privada entre duas pessoas.
        </p>
      </div>
      <nav className="flex flex-col gap-2" aria-label="Escolha quem está acessando">
        {people.map((p) => (
          <Link key={p.slug} href={`/u/${p.slug}`} className="nl-person-card">
            <Avatar
              name={p.firstName}
              tone={p.tone === "ACCENT" ? "accent" : "neutral"}
              size={44}
            />
            <span className="flex-1 text-[15px] font-medium">{p.firstName}</span>
            <CaretRightIcon size={16} aria-hidden />
          </Link>
        ))}
      </nav>
      <div className="nl-note">
        <ShieldCheckIcon size={14} aria-hidden />A conversa é ocultada sempre que você sair da
        janela.
      </div>
    </GateScreen>
  );
}
