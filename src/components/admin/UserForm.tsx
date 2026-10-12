"use client";

import {
  ArrowClockwiseIcon,
  CheckIcon,
  EyeSlashIcon,
  KeyIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import type { UserDto } from "@/lib/admin-api";
import { api, ApiError } from "@/lib/api-client";
import { firstNameOf, STATUS_OPTIONS, type UserStatus } from "@/lib/status";
import { isWeakPin, MSG } from "@/lib/validators";
import { CopyLink } from "./CopyLink";

type Errors = Partial<Record<"name" | "pin" | "pin2" | "status" | "photo" | "form", string>>;

type Props = {
  appUrl: string;
  /** Quantas pessoas ativas existem além desta (para a regra das 2 vagas). */
  othersActive: number;
} & ({ mode: "create"; defaultStatus: UserStatus } | { mode: "edit"; user: UserDto });

function validatePin(pin: string, pin2: string): Errors {
  const e: Errors = {};
  if (!/^\d{6}$/.test(pin)) e.pin = MSG.pinFormat;
  else if (isWeakPin(pin)) e.pin = MSG.pinWeak;
  if (!e.pin && pin2 !== pin) e.pin2 = MSG.pinMismatch;
  return e;
}

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** README §4.9 — Criar / Editar usuário. */
export function UserForm(props: Props) {
  const router = useRouter();
  const toast = useToast();
  const editing = props.mode === "edit" ? props.user : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [status, setStatus] = useState<UserStatus>(
    editing?.status ?? (props.mode === "create" ? props.defaultStatus : "ACTIVE"),
  );
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [changingPin, setChangingPin] = useState(props.mode === "create");
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(undefined); // undefined = não mexeu
  const [avatarPreview, setAvatarPreview] = useState<string | null>(editing?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmPin, setConfirmPin] = useState(false);
  const [created, setCreated] = useState<UserDto | null>(null);
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [confirmLink, setConfirmLink] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Vagas ocupadas por outras pessoas; sobe a cada "Criar outro" com status Ativo.
  const [othersActive, setOthersActive] = useState(props.othersActive);

  const clear = (k: keyof Errors) => setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  const tone = editing?.tone === "ACCENT" ? "accent" : "neutral";

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    clear("photo");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((e) => ({ ...e, photo: "Formato não suportado. Use JPG, PNG ou WEBP." }));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/avatars", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        avatarKey?: string;
        avatarUrl?: string;
        error?: { message: string };
      };
      if (!res.ok || !data.avatarKey)
        throw new Error(data.error?.message ?? "Não foi possível enviar a foto.");
      setAvatarKey(data.avatarKey);
      setAvatarPreview(data.avatarUrl ?? null);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        photo: err instanceof Error ? err.message : "Não foi possível enviar a foto.",
      }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = MSG.nameRequired;
    if (changingPin) Object.assign(e, validatePin(pin, pin2));
    if (status === "ACTIVE" && othersActive >= 2) e.status = MSG.roomFullForm;
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (saving || uploading) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    if (editing && changingPin) {
      setConfirmPin(true);
      return;
    }
    await save();
  }

  function applyServerError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.code === "ROOM_FULL") setErrors({ status: MSG.roomFullForm });
      else if (err.fields?.name) setErrors({ name: err.fields.name });
      else if (err.fields?.pin) setErrors({ pin: err.fields.pin });
      else setErrors({ form: err.message });
    } else setErrors({ form: "Algo deu errado. Tente de novo." });
  }

  async function save() {
    setSaving(true);
    try {
      if (!editing) {
        const { user } = await api<{ user: UserDto }>("/api/admin/users", {
          name,
          pin,
          status,
          ...(avatarKey ? { avatarKey } : {}),
        });
        setCreated(user);
        return;
      }
      await api(
        `/api/admin/users/${editing.id}`,
        { name, status, ...(avatarKey !== undefined ? { avatarKey } : {}) },
        "PATCH",
      );
      if (changingPin) await api(`/api/admin/users/${editing.id}/pin`, { pin });
      toast.success(changingPin ? "PIN alterado e alterações salvas." : "Alterações salvas.");
      router.push(`/admin/usuarios?destaque=${editing.id}`);
      router.refresh();
    } catch (err) {
      applyServerError(err);
    } finally {
      setSaving(false);
      setConfirmPin(false);
    }
  }

  async function regenerateLink() {
    if (!editing) return;
    setLinkBusy(true);
    try {
      const { user } = await api<{ user: UserDto }>(`/api/admin/users/${editing.id}/link`);
      setSlug(user.slug);
      toast.success("Novo link gerado. O anterior deixou de funcionar.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível gerar o link.");
    } finally {
      setLinkBusy(false);
      setConfirmLink(false);
    }
  }

  const back = (
    <Link
      href="/admin/usuarios"
      className="btn btn-ghost nl-muted-link self-start text-[13px] no-underline"
    >
      <span aria-hidden>←</span> Usuários
    </Link>
  );

  // ── "Usuário criado" ──────────────────────────────────────────────
  if (created) {
    const first = firstNameOf(created.name);
    const isActive = created.status === "ACTIVE";
    return (
      <div className="flex max-w-[540px] flex-col gap-[18px]">
        {back}
        <div className="card elev-sm" style={{ padding: 24, gap: 14 }} role="status">
          <div className="nl-check-box" aria-hidden>
            <CheckIcon size={22} weight="bold" />
          </div>
          <h3 className="m-0">Usuário criado</h3>
          <p className="nl-lead">
            {isActive
              ? `${first} já pode acessar a conversa com o PIN definido.`
              : `${first} foi criado(a) como Inativo. Ative quando houver uma vaga na sala.`}
          </p>
          <div className="field">
            <label>Link pessoal</label>
            <CopyLink url={`${props.appUrl}/u/${created.slug}`} />
            <div className="nl-field-hint">
              Envie este link para {first}. O PIN continua sendo pedido.
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Link
              href={`/admin/usuarios?destaque=${created.id}`}
              className="btn btn-primary no-underline"
            >
              Ver usuários
            </Link>
            <Button
              onClick={() => {
                setCreated(null);
                setName("");
                setPin("");
                setPin2("");
                setAvatarKey(undefined);
                setAvatarPreview(null);
                const occupied = othersActive + (isActive ? 1 : 0);
                setOthersActive(occupied);
                setStatus(occupied >= 2 ? "INACTIVE" : "ACTIVE");
                setErrors({});
              }}
            >
              Criar outro
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────
  const pinName = editing ? firstNameOf(editing.name) : "";
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-[540px] flex-col gap-[18px]">
      {back}
      <h2 className="m-0">{editing ? "Editar usuário" : "Novo usuário"}</h2>
      <div className="card elev-sm nl-form-card">
        {errors.form ? (
          <div className="nl-field-error mt-0" role="alert">
            {errors.form}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name || " "} tone={tone} size={64} photoUrl={avatarPreview} />
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
              Foto
            </div>
            <div className="flex gap-1.5">
              <label className="btn btn-secondary cursor-pointer">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => pickPhoto(e.target.files?.[0])}
                  disabled={uploading}
                />
                <UploadSimpleIcon size={15} aria-hidden />
                {uploading ? "Enviando…" : "Escolher foto"}
              </label>
              {avatarPreview ? (
                <Button
                  variant="ghost"
                  className="px-2.5"
                  onClick={() => {
                    setAvatarKey(null);
                    setAvatarPreview(null);
                  }}
                >
                  Remover
                </Button>
              ) : null}
            </div>
            {errors.photo ? <div className="nl-field-error">{errors.photo}</div> : null}
          </div>
        </div>

        <Input
          label="Nome"
          placeholder="Nome completo"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clear("name");
          }}
          error={errors.name}
          autoComplete="off"
          maxLength={60}
        />

        {changingPin ? (
          <>
            <div
              className="grid gap-3.5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
            >
              <Input
                label={editing ? "Novo PIN (6 dígitos)" : "PIN (6 dígitos)"}
                pin
                placeholder="••••••"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => {
                  setPin(onlyDigits(e.target.value));
                  clear("pin");
                }}
                error={errors.pin}
              />
              <Input
                label="Confirmar PIN"
                pin
                placeholder="••••••"
                autoComplete="new-password"
                value={pin2}
                onChange={(e) => {
                  setPin2(onlyDigits(e.target.value));
                  clear("pin2");
                }}
                error={errors.pin2}
              />
            </div>
            <div className="-mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[var(--color-neutral-500)]">
              <span className="flex items-start gap-1.5">
                <EyeSlashIcon size={14} aria-hidden className="mt-px flex-none" />
                <span>O PIN nunca é exibido. Evite sequências e números repetidos.</span>
              </span>
              {editing ? (
                <Button
                  variant="ghost"
                  className="ml-auto text-[12px]"
                  onClick={() => {
                    setChangingPin(false);
                    setPin("");
                    setPin2("");
                    clear("pin");
                    clear("pin2");
                  }}
                >
                  Manter PIN atual
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="field">
            <label>PIN</label>
            <div className="flex items-center gap-2.5">
              <div className="input nl-pin-locked" aria-label="PIN definido (oculto)">
                ••••••
              </div>
              <Button
                icon={<KeyIcon size={15} aria-hidden />}
                style={{ height: 40 }}
                onClick={() => setChangingPin(true)}
              >
                Alterar PIN
              </Button>
            </div>
          </div>
        )}

        <div className="field">
          <label id="status-label">Status</label>
          <Segmented
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              clear("status");
            }}
            options={STATUS_OPTIONS}
          />
          {errors.status ? (
            <div className="nl-field-error mt-1.5" role="alert">
              {errors.status}
            </div>
          ) : null}
        </div>

        {editing ? (
          <div className="field">
            <label>Link pessoal</label>
            <CopyLink url={`${props.appUrl}/u/${slug}`} />
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--color-neutral-500)]">
              <span>O link sozinho não dá acesso: o PIN é sempre pedido.</span>
              <Button
                variant="ghost"
                className="text-[12px]"
                icon={<ArrowClockwiseIcon size={13} aria-hidden />}
                onClick={() => setConfirmLink(true)}
              >
                Gerar novo link
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-1 flex justify-start gap-2">
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            loadingText="Salvando…"
            style={{ height: 38 }}
            disabled={uploading}
          >
            {editing ? "Salvar alterações" : "Criar usuário"}
          </Button>
          <Link
            href="/admin/usuarios"
            className="btn btn-secondary no-underline"
            style={{ height: 38 }}
          >
            Cancelar
          </Link>
        </div>
      </div>

      <Modal
        open={confirmPin}
        onOpenChange={setConfirmPin}
        title={
          <span className="flex flex-col gap-3">
            <span className="nl-icon-box" aria-hidden>
              <KeyIcon size={20} />
            </span>
            Alterar o PIN de {pinName}?
          </span>
        }
        description={`O PIN atual deixa de funcionar imediatamente. ${pinName} precisará do novo PIN no próximo desbloqueio.`}
        actions={
          <>
            <Button onClick={() => setConfirmPin(false)}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Alterar PIN
            </Button>
          </>
        }
      />

      <Modal
        open={confirmLink}
        onOpenChange={setConfirmLink}
        title={`Gerar novo link para ${pinName}?`}
        description="O link atual deixa de funcionar imediatamente. Envie o novo link para a pessoa."
        actions={
          <>
            <Button onClick={() => setConfirmLink(false)}>Cancelar</Button>
            <Button variant="primary" loading={linkBusy} onClick={regenerateLink}>
              Gerar novo link
            </Button>
          </>
        }
      />
    </form>
  );
}
