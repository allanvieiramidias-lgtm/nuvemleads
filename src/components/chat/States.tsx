import {
  ChatCircleDotsIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  WifiSlashIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";

/** README §4.3 — 5 bolhas esqueleto + "Carregando conversa…". */
export function LoadingState() {
  return (
    <div className="flex flex-col gap-2.5 pt-5" aria-busy="true">
      <div className="nl-skeleton" style={{ width: "52%" }} />
      <div className="nl-skeleton" style={{ width: "34%", animationDelay: ".1s" }} />
      <div className="nl-skeleton" data-mine style={{ width: "44%", animationDelay: ".2s" }} />
      <div
        className="nl-skeleton"
        style={{ width: 300, maxWidth: "70%", height: 180, animationDelay: ".3s" }}
      />
      <div className="nl-skeleton" data-mine style={{ width: "38%", animationDelay: ".4s" }} />
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--color-neutral-500)]">
        <CircleNotchIcon size={14} className="nl-spin" aria-hidden />
        Carregando conversa…
      </div>
    </div>
  );
}

/** README §4.11 */
export function EmptyState({ me, contact }: { me: string; contact: string }) {
  return (
    <div className="nl-state">
      <ChatCircleDotsIcon size={30} className="text-[var(--color-accent)]" aria-hidden />
      <div className="nl-state-title">Nenhuma mensagem ainda</div>
      <div className="nl-state-text">
        Tudo o que for enviado aqui fica visível apenas para {me} e {contact}.
      </div>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="nl-state" role="alert">
      <WarningCircleIcon size={30} className="text-[var(--nl-error)]" aria-hidden />
      <div className="nl-state-title">Não foi possível carregar a conversa</div>
      <div className="nl-state-text">Verifique sua conexão e tente de novo.</div>
      <div>
        <Button onClick={onRetry}>Tentar novamente</Button>
      </div>
    </div>
  );
}

/** README §4.3 — faixa offline. */
export function OfflineBanner() {
  return (
    <div className="nl-offline" role="status">
      <WifiSlashIcon size={15} aria-hidden />
      Sem conexão. As mensagens serão enviadas quando a conexão voltar.
    </div>
  );
}

/** Sem par ativo (a outra pessoa foi desativada e ainda não há substituta). */
export function WaitingState() {
  return (
    <div className="nl-state">
      <ChatCircleDotsIcon size={30} className="text-[var(--color-accent)]" aria-hidden />
      <div className="nl-state-title">A conversa ainda não está disponível</div>
      <div className="nl-state-text">Ela abre quando o administrador ativar a outra pessoa.</div>
    </div>
  );
}
