// Datas e horários no fuso de quem usa (padrão Brasília), em português.
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Sao_Paulo";

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const longDayFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
});
const longDayYearFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "09:40" */
export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

function dayKey(d: Date): string {
  return dayKeyFmt.format(d);
}

/** Dias de calendário (no fuso do app) entre `d` e `now`: 0 = hoje, 1 = ontem. */
export function daysAgo(d: Date, now = new Date()): number {
  const a = Date.parse(dayKey(d));
  const b = Date.parse(dayKey(now));
  return Math.round((b - a) / 86_400_000);
}

/** "Hoje" · "Ontem" · "12 de março" · "12 de março de 2025" (outro ano). */
export function formatDay(d: Date, now = new Date()): string {
  const n = daysAgo(d, now);
  if (n === 0) return "Hoje";
  if (n === 1) return "Ontem";
  const sameYear = dayKey(d).slice(0, 4) === dayKey(now).slice(0, 4);
  return (sameYear ? longDayFmt : longDayYearFmt).format(d);
}

/** "Hoje, 09:40" · "Ontem, 18:20" · "12 de março, 18:20" */
export function formatDayTime(d: Date, now = new Date()): string {
  return `${formatDay(d, now)}, ${formatTime(d)}`;
}

/** "Alterada hoje" · "há 3 dias" · "há 1 mês" · "há 3 meses" · "há mais de um ano" */
export function formatAgo(d: Date, now = new Date()): string {
  const days = daysAgo(d, now);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "há 1 mês" : `há ${months} meses`;
  return "há mais de um ano";
}
