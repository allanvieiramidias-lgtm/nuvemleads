"use client";

import { PencilSimpleIcon, PlusIcon, UserMinusIcon, UserPlusIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { UserDto } from "@/lib/admin-api";
import { api, ApiError } from "@/lib/api-client";
import { firstNameOf, STATUS_LABEL } from "@/lib/status";

type Row = UserDto & { lastActivityLabel: string };

/** README §4.8 */
export function UsersList({ users, highlightId }: { users: Row[]; highlightId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(highlightId);
  const active = users.filter((u) => u.status === "ACTIVE").length;

  // Destaque some depois de alguns segundos (transição de 400ms no CSS)
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(t);
  }, [highlight]);

  async function setStatus(u: Row, status: "ACTIVE" | "INACTIVE") {
    setBusy(u.id);
    try {
      await api(`/api/admin/users/${u.id}`, { status }, "PATCH");
      const first = firstNameOf(u.name);
      toast.success(
        status === "ACTIVE" ? `${first} foi reativado(a).` : `${first} foi desativado(a).`,
      );
      setHighlight(u.id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <h2>Usuários</h2>
          <p className="nl-lead">A conversa conecta exatamente duas pessoas ativas.</p>
        </div>
        <Link
          href="/admin/usuarios/novo"
          className="btn btn-primary no-underline"
          style={{ height: 38 }}
        >
          <PlusIcon size={15} aria-hidden />
          Novo usuário
        </Link>
      </div>

      <div className="-mt-1 flex items-center gap-2.5 text-[13px] text-[var(--color-neutral-400)]">
        <div className="nl-slots" aria-hidden>
          {[0, 1].map((i) => (
            <span key={i} className="nl-slot" data-on={i < active || undefined} />
          ))}
        </div>
        {active} de 2 vagas ativas
      </div>

      {users.length === 0 ? (
        <div className="card elev-sm" style={{ padding: 20 }}>
          <p className="nl-lead">Nenhum usuário ainda. Crie as duas pessoas da conversa.</p>
        </div>
      ) : (
        <ul className="card elev-sm m-0 list-none" style={{ padding: "4px 0", gap: 0 }}>
          {users.map((u) => {
            const isActive = u.status === "ACTIVE";
            return (
              <li
                key={u.id}
                className="nl-user-row"
                data-highlight={highlight === u.id || undefined}
              >
                <Avatar
                  name={u.name}
                  tone={u.tone === "ACCENT" ? "accent" : "neutral"}
                  size={44}
                  photoUrl={u.avatarUrl}
                  dim={!isActive}
                />
                <div className="min-w-[150px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium">{u.name}</span>
                    <Badge variant={isActive ? "accent" : "neutral"}>
                      {STATUS_LABEL[u.status]}
                    </Badge>
                  </div>
                  <div className="text-[12.5px] text-[var(--color-neutral-500)]">
                    Última atividade: {u.lastActivityLabel}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Link href={`/admin/usuarios/${u.id}`} className="btn btn-secondary no-underline">
                    <PencilSimpleIcon size={15} aria-hidden />
                    Editar
                  </Link>
                  <Button
                    variant="ghost"
                    className="px-2.5"
                    loading={busy === u.id}
                    icon={
                      isActive ? (
                        <UserMinusIcon size={15} aria-hidden />
                      ) : (
                        <UserPlusIcon size={15} aria-hidden />
                      )
                    }
                    onClick={() => {
                      if (isActive) setConfirm(u);
                      else if (active >= 2) toast.error("A sala já tem duas pessoas ativas.");
                      else void setStatus(u, "ACTIVE");
                    }}
                  >
                    {isActive ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          <span className="flex flex-col gap-3">
            <span className="nl-icon-box" aria-hidden>
              <UserMinusIcon size={20} />
            </span>
            {confirm ? `Desativar ${firstNameOf(confirm.name)}?` : ""}
          </span>
        }
        description="Essa pessoa perde o acesso à conversa até ser reativada. As mensagens são mantidas."
        actions={
          <>
            <Button onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={!!busy}
              onClick={() => confirm && setStatus(confirm, "INACTIVE")}
            >
              Desativar
            </Button>
          </>
        }
      />
    </>
  );
}
