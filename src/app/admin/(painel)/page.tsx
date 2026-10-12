import { ChatCircleTextIcon, ClockIcon, PaperclipIcon, UsersIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui/Avatar";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth/admin-session";
import { formatDay, formatDayTime, formatTime } from "@/lib/time";
import { getDashboard, type ActivityKind } from "@/server/dashboard";
import { PinAlerts } from "./PinAlerts";

export const metadata: Metadata = { title: "NuvemLeads" };
export const dynamic = "force-dynamic";

const KIND: Record<ActivityKind, string> = {
  TEXT: "uma mensagem",
  IMAGE: "uma imagem",
  VIDEO: "um vídeo",
  AUDIO: "um áudio",
  FILE: "um arquivo",
};

export default async function PainelPage() {
  const admin = await requireAdmin();
  const d = await getDashboard(db);
  const firstName = admin.name.split(/\s+/)[0];

  const stats = [
    {
      label: "Usuários",
      value: String(d.activeUsers),
      Icon: UsersIcon,
      sub: `${d.activeUsers} de 2 vagas ativas`,
    },
    {
      label: "Mensagens",
      value: String(d.messageCount),
      Icon: ChatCircleTextIcon,
      sub: "Desde a criação da sala",
    },
    {
      label: "Arquivos",
      value: String(d.fileCount),
      Icon: PaperclipIcon,
      sub: "Imagens, vídeos, áudios e arquivos",
    },
    {
      label: "Última atividade",
      value: d.lastActivity ? formatTime(d.lastActivity.at) : "—",
      Icon: ClockIcon,
      sub: d.lastActivity
        ? `${formatDay(d.lastActivity.at)} · ${d.lastActivity.firstName}`
        : "Nenhuma mensagem ainda",
    },
  ];

  return (
    <>
      <div>
        <div className="mb-1 text-[12px] text-[var(--color-neutral-500)]">NuvemLeads</div>
        <h2>Olá, {firstName}</h2>
        <p className="nl-lead">Resumo da sala privada.</p>
      </div>

      <PinAlerts alerts={d.pinAlerts} />

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        {stats.map(({ label, value, Icon, sub }) => (
          <div key={label} className="card elev-sm nl-stat">
            <div className="nl-stat-head">
              {label}
              <Icon size={17} aria-hidden />
            </div>
            <div className="nl-stat-value">{value}</div>
            <div className="card-meta">{sub}</div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-1.5" aria-labelledby="atividade">
        <h5 id="atividade" className="mb-1.5">
          Atividade recente
        </h5>
        {d.recent.length === 0 ? (
          <p className="nl-lead">Nenhuma atividade ainda.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {d.recent.map((r) => (
              <li key={r.id} className="nl-row-rule flex items-center gap-3 px-1 py-2.5">
                <Avatar
                  name={r.name}
                  tone={r.tone === "ACCENT" ? "accent" : "neutral"}
                  size={30}
                  photoUrl={r.avatarUrl}
                />
                <div className="flex-1 text-[14px]">
                  <span className="font-medium">{r.firstName}</span>{" "}
                  <span className="text-[var(--color-neutral-300)]">enviou {KIND[r.kind]}</span>
                </div>
                <time
                  className="text-[12px] whitespace-nowrap text-[var(--color-neutral-500)]"
                  dateTime={r.at.toISOString()}
                >
                  {formatDayTime(r.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
