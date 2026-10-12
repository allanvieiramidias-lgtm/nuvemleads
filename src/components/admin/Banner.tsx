import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="nl-banner-error" role="alert">
      <WarningCircleIcon size={16} weight="fill" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function SuccessBanner({ children }: { children: ReactNode }) {
  return (
    <div className="nl-banner-success" role="status">
      <CheckCircleIcon size={16} weight="fill" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
