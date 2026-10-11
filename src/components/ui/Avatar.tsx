import { cn } from "@/lib/cn";
import { initials as toInitials } from "@/lib/initials";

export type AvatarTone = "accent" | "neutral";
export type AvatarSize = 24 | 28 | 30 | 32 | 36 | 38 | 44 | 56 | 64;

export type AvatarProps = {
  name: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  photoUrl?: string | null;
  /** Ponto de presença: online pulsa em verde; offline fica cinza. */
  presence?: "online" | "offline";
  /** Cor do anel do ponto de presença (fundo onde o avatar está). */
  presenceRing?: "bg" | "surface";
  /** Esmaecido (usuário inativo). */
  dim?: boolean;
  className?: string;
};

/** README §4.11: círculo, iniciais 500 a 36% do tamanho. */
export function Avatar({
  name,
  tone = "neutral",
  size = 38,
  photoUrl,
  presence,
  presenceRing = "bg",
  dim,
  className,
}: AvatarProps) {
  return (
    <span
      className={cn("nl-avatar", className)}
      data-tone={tone}
      data-dim={dim || undefined}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        ["--nl-presence-ring" as string]: `var(--color-${presenceRing === "bg" ? "bg" : "surface"})`,
      }}
      role="img"
      aria-label={presence ? `${name}, ${presence === "online" ? "online" : "offline"}` : name}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- mídia vem de rota autenticada, sem otimizador
        <img className="nl-avatar-img" src={photoUrl} alt="" />
      ) : (
        <span aria-hidden>{toInitials(name)}</span>
      )}
      {presence ? (
        <span
          className="nl-presence"
          data-online={presence === "online" || undefined}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
