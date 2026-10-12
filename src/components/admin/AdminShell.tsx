"use client";

import { GearSixIcon, SignOutIcon, SquaresFourIcon, UsersIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { api } from "@/lib/api-client";

const NAV = [
  { href: "/admin", label: "Painel", Icon: SquaresFourIcon },
  { href: "/admin/usuarios", label: "Usuários", Icon: UsersIcon },
  { href: "/admin/configuracoes", label: "Configurações", Icon: GearSixIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** README §4.6: sidebar 228px no desktop/tablet; barra + pílulas no celular. */
export function AdminShell({
  name,
  email,
  children,
}: {
  name: string;
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/api/admin/logout").catch(() => null);
    router.replace("/admin/login");
    router.refresh();
  }

  const nav = (size: number) =>
    NAV.map(({ href, label, Icon }) => (
      <Link
        key={href}
        href={href}
        className="nl-admin-nav"
        aria-current={isActive(pathname, href) ? "page" : undefined}
      >
        <Icon size={size} aria-hidden />
        {label}
      </Link>
    ));

  return (
    <div className="nl-admin">
      <aside className="nl-admin-side" aria-label="Navegação do painel">
        <div className="px-2 pb-5">
          <Logo size={26} fontSize={16} />
        </div>
        <nav className="flex flex-col gap-1">{nav(18)}</nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          <Avatar name={name} size={32} tone="neutral" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{name}</div>
            <div className="truncate text-[11.5px] text-[var(--color-neutral-500)]">{email}</div>
          </div>
          <IconButton
            label="Sair"
            tooltip
            variant="plain"
            onClick={logout}
            icon={<SignOutIcon size={17} />}
            style={{ width: 30, height: 30 }}
          />
        </div>
      </aside>

      <header className="nl-admin-top">
        <div className="flex items-center gap-2">
          <span className="flex-1">
            <Logo size={24} fontSize={15} />
          </span>
          <IconButton
            label="Sair"
            variant="plain"
            onClick={logout}
            icon={<SignOutIcon size={18} />}
          />
        </div>
        <nav className="flex gap-1" aria-label="Navegação do painel">
          {nav(16)}
        </nav>
      </header>

      <main className="nl-admin-main">
        <div className="nl-admin-col">{children}</div>
      </main>
    </div>
  );
}
