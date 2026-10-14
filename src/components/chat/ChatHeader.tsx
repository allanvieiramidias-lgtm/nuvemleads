"use client";

import {
  BroomIcon,
  DotsThreeVerticalIcon,
  LockSimpleIcon,
  ShieldCheckIcon,
  SignOutIcon,
  TimerIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dropdown, DropdownInfo, DropdownItem } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
import { presenceText } from "./presence";
import { useChat } from "./store";

export function ChatHeader({
  autoLockMinutes,
  onLock,
  onLogout,
  onMyPhoto,
  onClear,
}: {
  autoLockMinutes: number;
  onLock: () => void;
  onLogout: () => void;
  /** DECISOES §31 */
  onMyPhoto?: () => void;
  onClear?: () => void;
}) {
  const contact = useChat((s) => s.contact);
  const typing = useChat((s) => s.contactTyping);
  const p = contact ? presenceText(contact.online, typing, contact.lastSeenAt) : null;
  const auto = `${autoLockMinutes} min`;

  return (
    <header className="nl-chat-head">
      <div className="nl-chat-logo">
        <Logo size={24} fontSize={15} />
      </div>
      {contact ? (
        <>
          <Avatar
            name={contact.name}
            tone={contact.tone === "ACCENT" ? "accent" : "neutral"}
            size={38}
            photoUrl={contact.avatarUrl}
            presence={contact.online ? "online" : "offline"}
          />
          <div className="nl-chat-who">
            <div className="nl-chat-name">{contact.name}</div>
            <div className="nl-chat-status" data-state={p?.state} aria-live="polite">
              {p?.text}
            </div>
          </div>
        </>
      ) : (
        <div className="nl-chat-who" />
      )}
      <div className="nl-lock-hint" title="Bloqueio automático">
        <ShieldCheckIcon size={15} aria-hidden />
        Bloqueio em {auto} sem atividade
      </div>
      <Button
        onClick={onLock}
        title="Bloquear agora"
        aria-label="Bloquear"
        style={{ height: 36 }}
        icon={<LockSimpleIcon size={16} aria-hidden />}
      >
        <span className="nl-lock-label">Bloquear</span>
      </Button>
      <Dropdown
        trigger={<IconButton label="Menu da sessão" icon={<DotsThreeVerticalIcon size={18} />} />}
        width={250}
      >
        <div className="nl-menu-kicker">Sessão</div>
        <DropdownItem icon={<LockSimpleIcon size={16} />} onSelect={onLock}>
          Bloquear agora
        </DropdownItem>
        <DropdownInfo icon={<TimerIcon size={16} />} title="Bloqueio automático">
          Após {auto} sem atividade ou ao sair da aba
        </DropdownInfo>
        {onMyPhoto || onClear ? <div className="nl-menu-kicker">Para você</div> : null}
        {onMyPhoto ? (
          <DropdownItem icon={<UserCircleIcon size={16} />} onSelect={onMyPhoto}>
            Minha foto
          </DropdownItem>
        ) : null}
        {onClear ? (
          <DropdownItem icon={<BroomIcon size={16} />} onSelect={onClear}>
            Limpar conversa
          </DropdownItem>
        ) : null}
        <DropdownItem icon={<SignOutIcon size={16} />} onSelect={onLogout}>
          Encerrar sessão
        </DropdownItem>
      </Dropdown>
    </header>
  );
}
