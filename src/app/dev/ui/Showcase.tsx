"use client";

import {
  ArrowClockwiseIcon,
  DotsThreeVerticalIcon,
  EyeSlashIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MicrophoneIcon,
  PaperPlaneRightIcon,
  PaperclipIcon,
  SignOutIcon,
  TimerIcon,
} from "@phosphor-icons/react/ssr";
import { useEffect, useState, type ReactNode } from "react";
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  DropdownInfo,
  DropdownItem,
  DropdownSeparator,
  IconButton,
  Input,
  Modal,
  PinInput,
  PinMessage,
  Segmented,
  Switch,
  useToast,
  type PinState,
} from "@/components/ui";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { EmptyState, ErrorState, LoadingState, OfflineBanner } from "@/components/chat/States";
import type { ChatMessage } from "@/components/chat/types";

const demoMsg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: crypto.randomUUID(),
  clientId: crypto.randomUUID(),
  senderId: "maria",
  kind: "TEXT",
  body: "",
  attachment: null,
  createdAt: "2026-10-13T12:15:00.000Z",
  status: "read",
  ...over,
});

function Card({
  kicker,
  children,
  wide = false,
}: {
  kicker: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="card elev-sm"
      style={{ padding: 18, gap: 14, ...(wide ? { gridColumn: "1 / -1" } : {}) }}
    >
      <div className="card-kicker">{kicker}</div>
      {children}
    </div>
  );
}

const DEMO_PIN = "246810";

/** PIN interativo com todos os estados (README §4.2). PIN de demonstração: 246810. */
function PinDemo() {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<PinState>("idle");
  const [errors, setErrors] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const remaining = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= blockedUntil) {
        setState("idle");
        setBlockedUntil(0);
      }
    }, 250);
    return () => clearInterval(t);
  }, [blockedUntil]);

  function verify(value: string) {
    if (value === DEMO_PIN) {
      setState("success");
      setTimeout(() => {
        setState("idle");
        setPin("");
      }, 1600);
      return;
    }
    const n = errors + 1;
    setErrors(n);
    setState("error");
    // Limpa o campo depois do tremor (420 ms).
    setTimeout(() => {
      setPin("");
      if (n % 3 === 0) {
        const until = Date.now() + 15_000;
        setNow(Date.now());
        setBlockedUntil(until);
        setState("blocked");
      } else {
        setState((s) => (s === "error" ? "idle" : s));
      }
    }, 420);
  }

  const message =
    state === "error" ? (
      <PinMessage tone="error">PIN incorreto. Tente novamente.</PinMessage>
    ) : state === "blocked" ? (
      <PinMessage tone="warning">
        Muitas tentativas. Aguarde alguns segundos. ({remaining}s)
      </PinMessage>
    ) : state === "success" ? (
      <PinMessage tone="success">PIN correto. Abrindo conversa…</PinMessage>
    ) : (
      <PinMessage />
    );

  return (
    <div className="flex flex-col gap-2.5">
      <PinInput
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (state === "error") setState("idle");
        }}
        onComplete={verify}
        state={state}
        errorKey={errors}
      />
      {message}
      <Button
        variant="primary"
        block
        large
        className="mt-0"
        disabled={pin.length < 6 || state === "blocked"}
        icon={
          state === "success" ? (
            <LockSimpleOpenIcon size={16} weight="bold" />
          ) : (
            <LockSimpleOpenIcon size={16} />
          )
        }
        onClick={() => verify(pin)}
      >
        {state === "success" ? "Desbloqueado" : "Desbloquear"}
      </Button>
      <div className="card-meta">
        Interativo · PIN de demonstração {DEMO_PIN} · 3 erros → espera de 15 s
      </div>
    </div>
  );
}

/** Estados estáticos do PIN para comparar com o protótipo. */
function PinStatic() {
  return (
    <div className="flex flex-col gap-2.5">
      <PinInput value="12" onChange={() => {}} label="PIN (exemplo preenchido)" />
      <PinInput value="123456" onChange={() => {}} state="error" label="PIN (exemplo com erro)" />
      <PinInput value="123456" onChange={() => {}} state="success" label="PIN (exemplo correto)" />
      <PinInput value="" onChange={() => {}} state="blocked" label="PIN (exemplo bloqueado)" />
      <div className="card-meta">Preenchido · erro · sucesso · bloqueado</div>
    </div>
  );
}

export function Showcase() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [tabLock, setTabLock] = useState(true);
  const [reopenLock, setReopenLock] = useState(false);
  const [autoLock, setAutoLock] = useState<"1" | "5" | "15" | "30">("5");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div
      className="grid gap-3.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
    >
      <Card kicker="Button">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Desbloquear</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Esqueci minha senha</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading loadingText="Entrando…">
            Entrar
          </Button>
          <Button variant="primary" disabled>
            Desativado
          </Button>
          <Button
            variant="secondary"
            loading={loading}
            loadingText="Salvando…"
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          >
            Testar loading
          </Button>
        </div>
        <Button
          variant="primary"
          block
          large
          className="mt-0"
          icon={<LockSimpleOpenIcon size={16} />}
        >
          Desbloquear (block)
        </Button>
      </Card>

      <Card kicker="Icon Button · Tooltip">
        <div className="flex items-center gap-2">
          <IconButton label="Menu da sessão" tooltip icon={<DotsThreeVerticalIcon size={18} />} />
          <IconButton label="Anexar" variant="plain" tooltip icon={<PaperclipIcon size={19} />} />
          <IconButton label="Bloquear agora" tooltip icon={<LockSimpleIcon size={17} />} />
          <button type="button" className="nl-round nl-round-send" aria-label="Enviar">
            <PaperPlaneRightIcon size={18} weight="fill" />
          </button>
          <button type="button" className="nl-round nl-round-mic" aria-label="Gravar áudio">
            <MicrophoneIcon size={19} />
          </button>
        </div>
        <div className="card-meta">Passe o mouse ou foque com Tab para ver o tooltip.</div>
      </Card>

      <Card kicker="Input">
        <Input label="E-mail" defaultValue="admin@nuvemleads.com" readOnly />
        <Input
          label="Nome"
          placeholder="Nome completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={name.trim().length >= 2 ? null : "Informe o nome da pessoa."}
        />
        <Input
          label="PIN (6 dígitos)"
          pin
          placeholder="••••••"
          hint={
            <span className="inline-flex items-center gap-1.5">
              <EyeSlashIcon size={14} /> O PIN nunca é exibido. Evite sequências e números
              repetidos.
            </span>
          }
        />
      </Card>

      <Card kicker="PIN Input">
        <PinDemo />
      </Card>

      <Card kicker="PIN Input · estados">
        <PinStatic />
      </Card>

      <Card kicker="Avatar · Badge">
        <div className="flex items-center gap-3">
          <Avatar name="Maria Clara" tone="accent" size={24} />
          <Avatar
            name="Maria Clara"
            tone="accent"
            size={38}
            presence="online"
            presenceRing="surface"
          />
          <Avatar
            name="Allan Souza"
            tone="neutral"
            size={38}
            presence="offline"
            presenceRing="surface"
          />
          <Avatar name="Maria Clara" tone="accent" size={56} />
          <Avatar name="Allan Souza" tone="neutral" size={44} dim />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="accent">Ativo</Badge>
          <Badge variant="neutral">Inativo</Badge>
          <Badge variant="outline">Admin</Badge>
          <Badge variant="online">Online</Badge>
        </div>
        <div className="card-meta">
          Tamanhos 24/28/30/38/44/56/64 · tons accent e neutral · inativo esmaecido
        </div>
      </Card>

      <Card kicker="Toast">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast.success("Configurações salvas.")}>Toast de sucesso</Button>
          <Button onClick={() => toast.error("O arquivo excede o limite de 25 MB.")}>
            Toast de erro
          </Button>
        </div>
        <div className="card-meta">Centralizado, 96 px acima da base, some após 2,8 s.</div>
      </Card>

      <Card kicker="Dropdown">
        <div>
          <Dropdown
            trigger={
              <Button icon={<DotsThreeVerticalIcon size={16} />}>Abrir menu de sessão</Button>
            }
            align="start"
          >
            <DropdownItem
              icon={<LockSimpleIcon size={16} />}
              onSelect={() => toast.success("Bloquear agora")}
            >
              Bloquear agora
            </DropdownItem>
            <DropdownInfo icon={<TimerIcon size={16} />} title="Bloqueio automático">
              Após 5 min sem atividade ou ao sair da aba
            </DropdownInfo>
            <DropdownSeparator />
            <DropdownItem
              icon={<SignOutIcon size={16} />}
              onSelect={() => toast.success("Encerrar sessão")}
            >
              Encerrar sessão
            </DropdownItem>
          </Dropdown>
        </div>
        <div className="card-meta">Setas navegam, Esc fecha, foco volta ao botão.</div>
      </Card>

      <Card kicker="Modal">
        <div>
          <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
        </div>
        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Alterar o PIN de Maria?"
          description="O PIN atual deixa de funcionar imediatamente. Maria precisará do novo PIN no próximo desbloqueio."
          actions={
            <>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setModalOpen(false);
                  toast.success("PIN alterado.");
                }}
              >
                Alterar PIN
              </Button>
            </>
          }
        />
        <div className="card-meta">Backdrop com blur 4 px · Esc fecha · foco preso no modal.</div>
      </Card>

      <Card kicker="Switch · Segmented">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="sw-tab" className="text-[14px]">
            Exigir PIN ao retornar à aba
          </label>
          <Switch id="sw-tab" checked={tabLock} onCheckedChange={setTabLock} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="sw-reopen" className="text-[14px]">
            Exigir PIN ao reabrir sessão
          </label>
          <Switch id="sw-reopen" checked={reopenLock} onCheckedChange={setReopenLock} />
        </div>
        <Segmented
          label="Tempo para bloqueio automático"
          value={autoLock}
          onChange={setAutoLock}
          options={[
            { value: "1", label: "1 min" },
            { value: "5", label: "5 min" },
            { value: "15", label: "15 min" },
            { value: "30", label: "30 min" },
          ]}
        />
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" },
          ]}
        />
      </Card>

      <Card kicker="Message Bubble · Group · Date Divider" wide>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3">
          <div className="nl-day" role="separator">
            Hoje
          </div>
          <MessageBubble
            m={demoMsg({ body: "Consegue me mandar o vídeo?" })}
            mine={false}
            first
            tail={false}
            isNew={false}
            onRetry={() => {}}
          />
          <MessageBubble
            m={demoMsg({ body: "É o de ontem." })}
            mine={false}
            first={false}
            tail
            isNew={false}
            onRetry={() => {}}
          />
          {(["sending", "sent", "delivered", "read"] as const).map((st, i) => (
            <MessageBubble
              key={st}
              m={demoMsg({ senderId: "allan", body: `Status: ${st}`, status: st })}
              mine
              first={i === 0}
              tail={st === "read"}
              isNew={false}
              onRetry={() => {}}
            />
          ))}
          <MessageBubble
            m={demoMsg({ senderId: "allan", body: "Esta falhou", status: "failed" })}
            mine
            first
            tail
            isNew={false}
            onRetry={() => {}}
          />
          <div className="nl-msg" data-tail style={{ marginTop: 14 }}>
            <div className="nl-bubble nl-typing" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className="card-meta">
          Recebida · enviada (enviando, enviada, entregue, lida, falhou) · digitando
        </div>
      </Card>

      <Card kicker="Estados da conversa" wide>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)] px-4">
            <LoadingState />
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <EmptyState me="Allan" contact="Maria" />
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <ErrorState onRetry={() => {}} />
          </div>
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <OfflineBanner />
          </div>
        </div>
      </Card>
    </div>
  );
}
