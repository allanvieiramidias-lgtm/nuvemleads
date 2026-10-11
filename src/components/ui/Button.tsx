import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Mostra spinner, desabilita e troca o texto (ex.: "Entrando…"). */
  loading?: boolean;
  loadingText?: ReactNode;
  block?: boolean;
  /** Altura 42px (botões principais de formulário). */
  large?: boolean;
  icon?: ReactNode;
};

/** README §4.11 / Nocturne `.btn`. O primário é contorno, nunca preenchido. */
export function Button({
  variant = "secondary",
  loading = false,
  loadingText,
  block = false,
  large = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("btn", `btn-${variant}`, block && "btn-block", large && "btn-lg", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
