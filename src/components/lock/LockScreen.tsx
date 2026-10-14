"use client";

import { CheckIcon, LockSimpleIcon, LockSimpleOpenIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useState } from "react";
import { GateScreen } from "@/components/participant/GateScreen";
import { UnreadNotice } from "@/components/participant/UnreadNotice";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PinInput, PinMessage, type PinState } from "@/components/ui/PinInput";
import { api, ApiError } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { type LockReason, useLock } from "./lock-store";

const SUCCESS_MS = 800;
const SHAKE_MS = 420;

function reasonText(r: LockReason | null, minutes: number) {
  switch (r) {
    case "TAB":
      return "Você saiu da aba do navegador.";
    case "BLUR":
      return "A janela do navegador perdeu o foco.";
    case "IDLE":
      return `Sem atividade por ${minutes} min.`;
    case "REOPEN":
      return "A página foi aberta novamente.";
    default:
      return "Bloqueada manualmente.";
  }
}

const wait = (s: number) =>
  s <= 60
    ? `Muitas tentativas. Aguarde alguns segundos. (${s}s)`
    : `Muitas tentativas. Tente novamente em ${Math.ceil(s / 60)} min.`;

/** README §4.4 — Sessão bloqueada. Tela inteira, não é modal: a conversa não está no DOM. */
export function LockScreen({
  me,
  onUnlocked,
  onRevoked,
}: {
  me: { name: string; tone: "ACCENT" | "NEUTRAL"; avatarUrl: string | null };
  onUnlocked: () => void;
  onRevoked: () => void;
}) {
  const reason = useLock((s) => s.reason);
  const lockedAt = useLock((s) => s.lockedAt);
  const minutes = useLock((s) => s.settings.autoLockMinutes);
  const [pin, setPin] = useState("");
  const [state, setState] = useState<PinState>("idle");
  const [errors, setErrors] = useState(0);
  const [until, setUntil] = useState(0);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!until) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(s);
      if (!s) {
        setUntil(0);
        setState("idle");
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [until]);

  async function verify(value: string) {
    if (busy || value.length !== 6 || state === "blocked" || state === "success") return;
    setBusy(true);
    try {
      await api("/api/session/unlock", { pin: value });
      setState("success");
      setTimeout(onUnlocked, SUCCESS_MS);
    } catch (e) {
      if (e instanceof ApiError && e.code === "REVOKED") return onRevoked();
      setErrors((n) => n + 1);
      setState("error");
      const tooMany = e instanceof ApiError && e.code === "TOO_MANY";
      const seconds = tooMany ? Number(e.fields?.retryAfter ?? 15) : 0;
      setTimeout(() => {
        setPin("");
        if (tooMany) {
          setState("blocked");
          setUntil(Date.now() + seconds * 1000);
        } else setState((s) => (s === "error" ? "idle" : s));
      }, SHAKE_MS);
    } finally {
      setBusy(false);
    }
  }

  const success = state === "success";
  return (
    <GateScreen width={340} gap={18}>
      <div className="nl-lock-icon" data-success={success || undefined} aria-hidden>
        {success ? <LockSimpleOpenIcon size={26} /> : <LockSimpleIcon size={26} />}
      </div>
      <div>
        <h3 className="mb-1.5">Sessão bloqueada</h3>
        <p className="m-0 text-[14px] text-[var(--color-neutral-400)]">
          Por segurança, sua conversa foi ocultada.
        </p>
        <UnreadNotice />
      </div>
      <PinInput
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (state === "error") setState("idle");
        }}
        onComplete={verify}
        state={state}
        errorKey={errors}
        autoFocus
      />
      <div className="-mt-2">
        {state === "error" ? (
          <PinMessage tone="error">PIN incorreto. Tente novamente.</PinMessage>
        ) : state === "blocked" ? (
          <PinMessage tone="warning">{wait(left)}</PinMessage>
        ) : success ? (
          <PinMessage tone="success">PIN correto. Abrindo conversa…</PinMessage>
        ) : (
          <PinMessage />
        )}
      </div>
      <Button
        variant="primary"
        block
        large
        className="-mt-1.5"
        disabled={pin.length < 6 || state === "blocked" || busy}
        icon={
          success ? (
            <CheckIcon size={16} weight="bold" aria-hidden />
          ) : (
            <LockSimpleOpenIcon size={16} aria-hidden />
          )
        }
        onClick={() => verify(pin)}
      >
        {success ? "Desbloqueado" : "Desbloquear"}
      </Button>
      <div className="nl-lock-foot">
        <Avatar
          name={me.name}
          tone={me.tone === "ACCENT" ? "accent" : "neutral"}
          size={28}
          photoUrl={me.avatarUrl}
        />
        <span>
          Sessão de {me.name} · bloqueada às {lockedAt ? formatTime(new Date(lockedAt)) : "--:--"}
          <br />
          {reasonText(reason, minutes)}
        </span>
      </div>
    </GateScreen>
  );
}
