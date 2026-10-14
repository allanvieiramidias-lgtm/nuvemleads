"use client";

import { CheckIcon, LockSimpleOpenIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { UnreadNotice } from "@/components/participant/UnreadNotice";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PinInput, PinMessage, type PinState } from "@/components/ui/PinInput";
import { api, ApiError } from "@/lib/api-client";

type Profile = {
  name: string;
  tone: "ACCENT" | "NEUTRAL";
  avatarUrl: string | null;
  pinChangedByAdmin: boolean;
};

const SUCCESS_DELAY_MS = 800;
const SHAKE_MS = 420;

/** Mensagem de espera: segundos até 1 min, depois minutos (DECISOES §23). */
function waitMessage(seconds: number) {
  return seconds <= 60
    ? `Muitas tentativas. Aguarde alguns segundos. (${seconds}s)`
    : `Muitas tentativas. Tente novamente em ${Math.ceil(seconds / 60)} min.`;
}

/**
 * Tela de PIN. Pelo link pessoal (`slug` + `profile`) ou pela página principal
 * (`username`, sem revelar quem é — DECISOES §29). `remembered`: este aparelho já é desta
 * pessoa, então mostra o aviso de mensagens novas.
 */
export function PinGate(
  props: (
    | { slug: string; profile: Profile; username?: never; header?: never }
    | { username: string; header: ReactNode; slug?: never; profile?: never }
  ) & { remembered?: boolean },
) {
  const { slug, profile } = props;
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [state, setState] = useState<PinState>("idle");
  const [errorCount, setErrorCount] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // contagem regressiva da espera
  useEffect(() => {
    if (!blockedUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setBlockedUntil(0);
        setState("idle");
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [blockedUntil]);

  async function verify(value: string) {
    if (busy || state === "blocked" || state === "success" || value.length !== 6) return;
    setBusy(true);
    setFormError(null);
    try {
      await api(
        "/api/auth/pin",
        props.username !== undefined
          ? { username: props.username, pin: value }
          : { slug, pin: value },
      );
      setState("success");
      setTimeout(() => router.replace("/chat"), SUCCESS_DELAY_MS);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_PIN") {
        setErrorCount((n) => n + 1);
        setState("error");
        setTimeout(() => {
          setPin("");
          setState((s) => (s === "error" ? "idle" : s));
        }, SHAKE_MS);
      } else if (err instanceof ApiError && err.code === "TOO_MANY") {
        setErrorCount((n) => n + 1);
        setState("error"); // tremor antes da espera
        const seconds = Number(err.fields?.retryAfter ?? 15);
        setTimeout(() => {
          setPin("");
          setState("blocked");
          setBlockedUntil(Date.now() + seconds * 1000);
        }, SHAKE_MS);
      } else if (err instanceof ApiError && err.code === "NOT_FOUND") {
        router.refresh(); // link deixou de valer: a página mostra o aviso
      } else {
        setFormError(err instanceof ApiError ? err.message : "Algo deu errado. Tente de novo.");
      }
    } finally {
      setBusy(false);
    }
  }

  const success = state === "success";
  const message =
    state === "error" ? (
      <PinMessage tone="error">PIN incorreto. Tente novamente.</PinMessage>
    ) : state === "blocked" ? (
      <PinMessage tone="warning">{waitMessage(remaining)}</PinMessage>
    ) : success ? (
      <PinMessage tone="success">PIN correto. Abrindo conversa…</PinMessage>
    ) : formError ? (
      <PinMessage tone="error">{formError}</PinMessage>
    ) : (
      <PinMessage />
    );

  return (
    <>
      {profile ? (
        <div className="flex items-center gap-3.5">
          <span className="nl-me-ring" data-success={success || undefined}>
            <Avatar
              name={profile.name}
              tone={profile.tone === "ACCENT" ? "accent" : "neutral"}
              size={64}
              photoUrl={profile.avatarUrl}
            />
          </span>
          <div>
            <div className="text-[16px] font-medium">{profile.name}</div>
            <Button
              variant="ghost"
              className="-ml-[3px] text-[12.5px]"
              onClick={async () => {
                await api("/api/auth/switch").catch(() => null);
                router.replace("/");
              }}
            >
              Não é você? Trocar
            </Button>
          </div>
        </div>
      ) : (
        props.header
      )}

      <div>
        <h3 className="mb-1.5">Digite seu PIN</h3>
        <p className="m-0 text-[14px] text-[var(--color-neutral-400)]">
          Use os 6 dígitos definidos pelo administrador.
        </p>
        {props.remembered ? <UnreadNotice /> : null}
        {profile?.pinChangedByAdmin ? (
          <p className="nl-notice-warning mt-2.5 mb-0" role="status">
            <WarningIcon size={15} aria-hidden className="mt-0.5 flex-none" />
            Seu PIN foi alterado pelo administrador.
          </p>
        ) : null}
      </div>

      <PinInput
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (state === "error") setState("idle");
        }}
        onComplete={verify}
        state={state}
        errorKey={errorCount}
        autoFocus
      />
      <div className="-mt-2">{message}</div>

      <Button
        variant="primary"
        block
        large
        className="-mt-1.5"
        disabled={pin.length < 6 || state === "blocked" || busy}
        aria-disabled={success || undefined}
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
    </>
  );
}
