"use client";

import {
  FileIcon,
  HardDrivesIcon,
  ImageIcon,
  MicrophoneIcon,
  TrashIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api-client";
import { formatStorage } from "@/lib/format";
import type { MediaKind, MediaStats } from "@/server/media-lifecycle";

type Retention = "0" | "30" | "90" | "180" | "365";
const RETENTION: { value: Retention; label: string }[] = [
  { value: "0", label: "Nunca" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "180", label: "6 meses" },
  { value: "365", label: "1 ano" },
];

const KINDS: { kind: MediaKind; label: string; Icon: typeof ImageIcon }[] = [
  { kind: "IMAGE", label: "Fotos", Icon: ImageIcon },
  { kind: "VIDEO", label: "Vídeos", Icon: VideoCameraIcon },
  { kind: "AUDIO", label: "Áudios", Icon: MicrophoneIcon },
  { kind: "FILE", label: "Arquivos", Icon: FileIcon },
];

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Painel de mídias (DECISOES §30): só números; nada de nomes, miniaturas ou conteúdo. */
export function MediaPanel({
  stats,
  disk,
  retentionDays,
}: {
  stats: MediaStats;
  disk: { totalBytes: number; freeBytes: number } | null;
  retentionDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [retention, setRetention] = useState<Retention>(String(retentionDays) as Retention);
  const [savingRetention, setSavingRetention] = useState(false);
  const [before, setBefore] = useState("");
  const [kinds, setKinds] = useState<MediaKind[]>(["IMAGE", "VIDEO", "AUDIO", "FILE"]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ count: number; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const maxMonth = Math.max(1, ...stats.byMonth.map((m) => m.bytes));
  const usedPct = disk
    ? Math.min(100, ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100)
    : 0;

  async function saveRetention() {
    setSavingRetention(true);
    try {
      await api("/api/admin/media", { retentionDays: Number(retention) }, "PATCH");
      toast.success(
        retention === "0"
          ? "Limpeza automática desligada."
          : "Limpeza automática salva. Ela roda a cada hora.",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar.");
    } finally {
      setSavingRetention(false);
    }
  }

  async function askPurge() {
    setError(null);
    if (!before) return setError("Escolha uma data.");
    if (!kinds.length) return setError("Escolha ao menos um tipo.");
    setBusy(true);
    try {
      const p = await api<{ count: number; bytes: number }>("/api/admin/media/preview", {
        before,
        kinds,
      });
      if (!p.count) setError("Nenhuma mídia guardada antes dessa data com esses tipos.");
      else setPreview(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível calcular.");
    } finally {
      setBusy(false);
    }
  }

  async function purge() {
    setBusy(true);
    try {
      const r = await api<{ count: number; bytes: number }>("/api/admin/media/purge", {
        before,
        kinds,
      });
      toast.success(
        `${plural(r.count, "mídia apagada", "mídias apagadas")} (${formatStorage(r.bytes)}).`,
      );
      setPreview(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível apagar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <h2>Mídias</h2>
        <p className="nl-lead">
          Espaço usado e limpeza. Fotos, vídeos, áudios e arquivos nunca aparecem aqui.
        </p>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        <div className="card elev-sm nl-stat">
          <div className="nl-stat-head">
            Espaço usado
            <HardDrivesIcon size={18} aria-hidden />
          </div>
          <div className="nl-stat-value">{formatStorage(stats.total.bytes)}</div>
          <div className="card-meta">
            {disk
              ? `${formatStorage(disk.freeBytes)} livres no servidor`
              : plural(stats.total.count, "mídia guardada", "mídias guardadas")}
          </div>
          {disk ? (
            <div
              className="nl-meter"
              role="meter"
              aria-label="Disco do servidor usado"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usedPct)}
            >
              <span style={{ width: `${usedPct}%` }} />
            </div>
          ) : null}
        </div>
        {KINDS.map(({ kind, label, Icon }) => (
          <div key={kind} className="card elev-sm nl-stat">
            <div className="nl-stat-head">
              {label}
              <Icon size={18} aria-hidden />
            </div>
            <div className="nl-stat-value">{formatStorage(stats.byKind[kind].bytes)}</div>
            <div className="card-meta">{plural(stats.byKind[kind].count, "item", "itens")}</div>
          </div>
        ))}
      </div>

      <section className="card elev-sm nl-media-section" aria-labelledby="mes-titulo">
        <div id="mes-titulo" className="card-kicker">
          Por mês
        </div>
        {stats.byMonth.length ? (
          <ul className="nl-months">
            {stats.byMonth.map((m) => (
              <li key={m.month}>
                <span className="nl-month-label">{monthLabel(m.month)}</span>
                <span className="nl-month-bar" aria-hidden>
                  <span style={{ width: `${(m.bytes / maxMonth) * 100}%` }} />
                </span>
                <span className="nl-month-value">
                  {formatStorage(m.bytes)} · {plural(m.count, "item", "itens")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nl-setting-hint m-0">Nenhuma mídia nos últimos 12 meses.</p>
        )}
        {stats.expired ? (
          <p className="nl-setting-hint m-0">
            {plural(stats.expired, "mídia já foi apagada", "mídias já foram apagadas")} da conversa.
          </p>
        ) : null}
      </section>

      <section className="card elev-sm nl-media-section" aria-labelledby="auto-titulo">
        <div id="auto-titulo" className="card-kicker">
          Limpeza automática
        </div>
        <div className="field">
          <label id="ret-label">Apagar mídias com mais de</label>
          <Segmented
            label="Apagar mídias com mais de"
            value={retention}
            onChange={setRetention}
            options={RETENTION}
          />
          <div className="nl-setting-hint mt-1.5">
            As mais antigas são apagadas do servidor a cada hora. Na conversa, aparece “Mídia
            expirada” para as duas pessoas. Textos não são apagados.
          </div>
        </div>
        <div>
          <Button
            variant="primary"
            loading={savingRetention}
            loadingText="Salvando…"
            disabled={retention === String(retentionDays)}
            onClick={saveRetention}
          >
            Salvar limpeza automática
          </Button>
        </div>
      </section>

      <section className="card elev-sm nl-media-section" aria-labelledby="manual-titulo">
        <div id="manual-titulo" className="card-kicker">
          Limpeza manual
        </div>
        <Input
          label="Apagar mídias enviadas antes de"
          type="date"
          value={before}
          onChange={(e) => {
            setBefore(e.target.value);
            setError(null);
          }}
          className="max-w-[220px]"
        />
        <fieldset className="nl-kinds">
          <legend>Tipos</legend>
          {KINDS.map(({ kind, label }) => (
            <label key={kind} className="nl-check">
              <input
                type="checkbox"
                checked={kinds.includes(kind)}
                onChange={(e) => {
                  setError(null);
                  setKinds((ks) =>
                    e.target.checked ? [...ks, kind] : ks.filter((k) => k !== kind),
                  );
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {error ? (
          <div className="nl-field-error mt-0" role="alert">
            {error}
          </div>
        ) : null}
        <div>
          <Button
            icon={<TrashIcon size={15} aria-hidden />}
            loading={busy && !preview}
            loadingText="Calculando…"
            onClick={askPurge}
          >
            Apagar mídias…
          </Button>
        </div>
      </section>

      <Modal
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview ? `Apagar ${plural(preview.count, "mídia", "mídias")}?` : ""}
        description={
          preview
            ? `Libera ${formatStorage(preview.bytes)}. Elas somem da conversa para as duas pessoas e não podem ser recuperadas.`
            : undefined
        }
        actions={
          <>
            <Button onClick={() => setPreview(null)}>Cancelar</Button>
            <Button variant="primary" loading={busy} loadingText="Apagando…" onClick={purge}>
              Apagar
            </Button>
          </>
        }
      />
    </>
  );
}
