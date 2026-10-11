"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Rótulo acessível — obrigatório em botões só de ícone. */
  label: string;
  icon: ReactNode;
  variant?: "secondary" | "plain";
  /** Mostra o rótulo como tooltip ao passar o mouse/focar. */
  tooltip?: boolean;
};

export function IconButton({
  label,
  icon,
  variant = "secondary",
  tooltip = false,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "btn btn-icon",
        variant === "secondary" ? "btn-secondary" : "btn-plain",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
