"use client";

import { DotsThreeIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useRef, useState, type ReactNode } from "react";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Ações de uma mensagem (DECISOES §31): "⋯" ao passar o mouse, toque longo no celular ou
 * botão direito. Hoje só "Apagar para mim".
 */
export function MessageActions({
  children,
  onHide,
  disabled,
}: {
  children: ReactNode;
  onHide: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const press = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout> } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (press.current) clearTimeout(press.current.t);
    press.current = null;
  };

  if (disabled) return <>{children}</>;

  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
      <div
        className="nl-msg-actions"
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          fired.current = false;
          const t = setTimeout(() => {
            fired.current = true;
            navigator.vibrate?.(10);
            setOpen(true);
          }, LONG_PRESS_MS);
          press.current = { x: e.clientX, y: e.clientY, t };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onClickCapture={(e) => {
          // o toque longo não deve abrir a foto/vídeo por baixo
          if (fired.current) {
            e.preventDefault();
            e.stopPropagation();
            fired.current = false;
          }
        }}
      >
        {children}
        <Menu.Trigger asChild>
          <button type="button" className="nl-msg-more" aria-label="Mais ações">
            <DotsThreeIcon size={18} weight="bold" aria-hidden />
          </button>
        </Menu.Trigger>
      </div>
      <Menu.Portal>
        <Menu.Content
          className="nl-menu"
          style={{ width: 200 }}
          sideOffset={4}
          collisionPadding={8}
        >
          <Menu.Item className="nl-menu-item" onSelect={onHide}>
            <TrashIcon size={16} aria-hidden />
            Apagar para mim
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
