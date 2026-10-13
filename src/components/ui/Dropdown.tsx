"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

/** Menu suspenso (Radix). README §4.3: surface, shadow-md, raio 14, padding 6, entrada rise 160ms. */
export function Dropdown({
  trigger,
  children,
  width = 250,
  align = "end",
}: {
  trigger: ReactNode;
  children: ReactNode;
  width?: number;
  align?: "start" | "center" | "end";
}) {
  return (
    // Não modal: o resto da página não ganha aria-hidden (aria-hidden-focus no axe);
    // o foco entra no menu, Esc e Tab fecham, como no padrão de botão de menu.
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="nl-menu"
          style={{ width }}
          align={align}
          sideOffset={6}
          collisionPadding={8}
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function DropdownItem({
  icon,
  children,
  onSelect,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <Menu.Item className="nl-menu-item" onSelect={onSelect} disabled={disabled}>
      {icon}
      {children}
    </Menu.Item>
  );
}

/** Bloco informativo não clicável (ex.: "Bloqueio automático — Após 5 min…"). */
export function DropdownInfo({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="nl-menu-info" role="presentation">
      {icon}
      <div>
        {title}
        {children ? <small>{children}</small> : null}
      </div>
    </div>
  );
}

export function DropdownSeparator() {
  return <Menu.Separator className="nl-menu-sep" />;
}
