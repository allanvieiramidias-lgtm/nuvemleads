"use client";

import { PasswordIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api-client";
import { MSG } from "@/lib/validators";

type Settings = {
  autoLockMinutes: 1 | 5 | 15 | 30;
  lockOnTabLeave: boolean;
  lockOnReopen: boolean;
  unreadNotice: boolean;
};
type Minutes = "1" | "5" | "15" | "30";

const LOCK_OPTIONS: { value: Minutes; label: string }[] = [
  { value: "1", label: "1 min" },
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
];

/** README §4.10 */
export function SettingsForm({
  initial,
  account,
  passwordChanged,
}: {
  initial: Settings;
  account: { name: string; email: string };
  passwordChanged: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState(initial);
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  async function save() {
    if (saving) return;
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = "Informe o nome do administrador.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Informe um e-mail válido.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      await api("/api/admin/settings", s, "PATCH");
      if (name.trim() !== account.name || email.trim().toLowerCase() !== account.email) {
        await api("/api/admin/account", { name, email }, "PATCH");
      }
      toast.success("Configurações salvas.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && (err.fields?.email || err.fields?.name)) setErrors(err.fields);
      else toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-5">
      <h2 className="m-0">Configurações</h2>

      <section
        className="card elev-sm"
        style={{ padding: 20, gap: 18 }}
        aria-labelledby="seg-kicker"
      >
        <div id="seg-kicker" className="card-kicker">
          Segurança
        </div>
        <div className="flex flex-col gap-2">
          <div className="nl-setting-title">Tempo para bloqueio automático</div>
          <div className="nl-setting-hint -mt-1">
            A conversa é ocultada após esse tempo sem atividade.
          </div>
          <Segmented
            label="Tempo para bloqueio automático"
            value={String(s.autoLockMinutes) as Minutes}
            onChange={(v) =>
              setS({ ...s, autoLockMinutes: Number(v) as Settings["autoLockMinutes"] })
            }
            options={LOCK_OPTIONS}
          />
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <label htmlFor="sw-tab" className="nl-setting-title block">
              Exigir PIN ao retornar à aba
            </label>
            <div className="nl-setting-hint">
              Bloqueia ao trocar de aba ou quando a janela perde o foco.
            </div>
          </div>
          <Switch
            id="sw-tab"
            checked={s.lockOnTabLeave}
            onCheckedChange={(v) => setS({ ...s, lockOnTabLeave: v })}
          />
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <label htmlFor="sw-reopen" className="nl-setting-title block">
              Exigir PIN ao reabrir sessão
            </label>
            <div className="nl-setting-hint">Pede o PIN sempre que o navegador for reaberto.</div>
          </div>
          <Switch
            id="sw-reopen"
            checked={s.lockOnReopen}
            onCheckedChange={(v) => setS({ ...s, lockOnReopen: v })}
          />
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <label htmlFor="sw-unread" className="nl-setting-title block">
              Avisar novas mensagens na tela de PIN
            </label>
            <div className="nl-setting-hint">
              Mostra “Você tem novas mensagens” no aparelho da pessoa, sem revelar o conteúdo.
            </div>
          </div>
          <Switch
            id="sw-unread"
            checked={s.unreadNotice}
            onCheckedChange={(v) => setS({ ...s, unreadNotice: v })}
          />
        </div>
      </section>

      <section
        className="card elev-sm"
        style={{ padding: 20, gap: 16 }}
        aria-labelledby="conta-kicker"
      >
        <div id="conta-kicker" className="card-kicker">
          Conta
        </div>
        <Input
          label="Nome do administrador"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined }));
          }}
          error={errors.name}
          autoComplete="name"
        />
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((x) => ({ ...x, email: undefined }));
          }}
          error={errors.email}
          autoComplete="email"
        />
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <div className="nl-setting-title">Senha</div>
            <div className="nl-setting-hint">Alterada {passwordChanged}</div>
          </div>
          <Button icon={<PasswordIcon size={15} aria-hidden />} onClick={() => setPwOpen(true)}>
            Alterar senha
          </Button>
        </div>
      </section>

      <div>
        <Button
          variant="primary"
          loading={saving}
          loadingText="Salvando…"
          onClick={save}
          style={{ height: 38 }}
        >
          Salvar configurações
        </Button>
      </div>

      <PasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onDone={() => {
          setPwOpen(false);
          toast.success("Senha alterada.");
          router.refresh();
        }}
      />
    </div>
  );
}

function PasswordModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setErrors({});
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (saving) return;
    const errs: typeof errors = {};
    if (!current) errs.current = "Informe a senha atual.";
    if (next.length < 10) errs.next = MSG.passwordShort;
    if (!errs.next && confirm !== next) errs.confirm = "As senhas não coincidem.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api("/api/admin/account/password", { current, next });
      reset();
      onDone();
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.fields
          ? err.fields
          : { current: "Não foi possível alterar a senha." },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title="Alterar senha"
      actions={
        <>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => submit()}>
            Salvar senha
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Input
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <Input
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.next}
          hint={errors.next ? undefined : "Mínimo de 10 caracteres."}
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
