import { cn } from "@/lib/cn";

/**
 * Símbolo do NuvemLeads (README §9): nuvem que também é balão de conversa,
 * com um ponto + haste sugerindo fechadura. Traço em --color-accent.
 */
export function LogoMark({
  size = 28,
  strokeWidth = 1.8,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M10 25h12.5a5.5 5.5 0 0 0 .9-10.93A7.5 7.5 0 0 0 9.2 12.6 6.2 6.2 0 0 0 10 25Z"
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M11.5 25 9.6 28.6 15.5 25"
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="16" cy="17.6" r="1.7" fill="var(--color-accent)" />
      <rect x="15.25" y="18.6" width="1.5" height="3.2" rx="0.75" fill="var(--color-accent)" />
    </svg>
  );
}

/** Símbolo + wordmark "Nuvem" (texto) + "Leads" (accent-300). */
export function Logo({
  size = 28,
  fontSize = 17,
  className,
}: {
  size?: number;
  fontSize?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center", className)}
      style={{ gap: Math.round(size * 0.36) }}
    >
      <LogoMark size={size} />
      <span className="nl-wordmark" style={{ fontSize }}>
        Nuvem<span>Leads</span>
      </span>
    </span>
  );
}
