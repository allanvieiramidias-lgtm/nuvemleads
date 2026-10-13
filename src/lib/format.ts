/** "2,4 MB" · "120 KB" (README §4.3). */
export function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** "0:42" · "1:28" · "1:02:05" */
export function formatDuration(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(sec ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** Extensão em maiúsculas para "PDF · 2,4 MB". */
export function extLabel(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1]!.toUpperCase() : "ARQUIVO";
}
