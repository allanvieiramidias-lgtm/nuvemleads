import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "accent" | "neutral" | "outline" | "online";

/** README §4.11: Ativo (accent), Inativo (neutral), Admin (outline), Online. */
export function Badge({
  variant = "neutral",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("tag", `tag-${variant}`, className)}>{children}</span>;
}
