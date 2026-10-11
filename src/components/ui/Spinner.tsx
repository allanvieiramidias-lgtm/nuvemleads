import { CircleNotchIcon } from "@phosphor-icons/react/ssr";

export function Spinner({ size = 16 }: { size?: number }) {
  return <CircleNotchIcon size={size} className="nl-spin" aria-hidden />;
}
