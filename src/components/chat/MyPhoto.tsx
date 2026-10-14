"use client";

import { UploadSimpleIcon } from "@phosphor-icons/react/ssr";
import { useRef, useState } from "react";
import { openPicker } from "@/components/lock/picker-guard";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * "Minha foto" (DECISOES §31): a própria pessoa troca ou remove a foto de perfil.
 * A outra pessoa vê a mudança na hora.
 */
export function MyPhoto({
  open,
  onOpenChange,
  name,
  tone,
  avatarUrl,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  tone: "ACCENT" | "NEUTRAL";
  avatarUrl: string | null;
  onChanged: (url: string | null) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE", file?: File) {
    setBusy(true);
    setError(null);
    try {
      let body: FormData | undefined;
      if (file) {
        body = new FormData();
        body.append("file", file);
      }
      const res = await fetch("/api/me/avatar", { method, body, credentials: "same-origin" });
      const data = (await res.json().catch(() => null)) as {
        avatarUrl?: string | null;
        error?: { message: string };
      } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "Não foi possível salvar a foto.");
      onChanged(data?.avatarUrl ?? null);
      toast.success(method === "DELETE" ? "Foto removida." : "Foto atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Minha foto"
      description="Aparece para a outra pessoa no topo da conversa."
      closeButton
      actions={<Button onClick={() => onOpenChange(false)}>Fechar</Button>}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          name={name}
          tone={tone === "ACCENT" ? "accent" : "neutral"}
          size={64}
          photoUrl={avatarUrl}
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void send("POST", f);
              }}
            />
            <Button
              icon={<UploadSimpleIcon size={15} aria-hidden />}
              loading={busy}
              loadingText="Enviando…"
              onClick={() => input.current && openPicker(input.current)}
            >
              Escolher foto
            </Button>
            {avatarUrl ? (
              <Button variant="ghost" disabled={busy} onClick={() => void send("DELETE")}>
                Remover foto
              </Button>
            ) : null}
          </div>
          <div className="nl-setting-hint">JPG, PNG ou WEBP, até 5 MB.</div>
          {error ? (
            <div className="nl-field-error mt-0" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
