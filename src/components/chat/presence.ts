import { daysAgo, formatDay, formatTime } from "@/lib/time";

/** "Online" · "digitando…" · "Visto por último hoje às 09:40" (README §4.3). */
export function presenceText(
  online: boolean,
  typing: boolean,
  lastSeenAt: string | null,
  now = new Date(),
) {
  if (typing) return { state: "typing" as const, text: "digitando…" };
  if (online) return { state: "online" as const, text: "Online" };
  if (!lastSeenAt) return { state: "offline" as const, text: "Offline" };
  const d = new Date(lastSeenAt);
  const n = daysAgo(d, now);
  const day = n === 0 ? "hoje" : n === 1 ? "ontem" : `em ${formatDay(d, now)}`;
  return { state: "offline" as const, text: `Visto por último ${day} às ${formatTime(d)}` };
}
