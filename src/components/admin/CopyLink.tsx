"use client";

import { CopyIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** Link pessoal /u/<slug> com "Copiar link" (README §4.9, produção). */
export function CopyLink({ url }: { url: string }) {
  const toast = useToast();
  return (
    <div className="nl-link-box">
      <code title={url}>{url}</code>
      <Button
        variant="secondary"
        icon={<CopyIcon size={15} aria-hidden />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copiado.");
          } catch {
            toast.error("Não foi possível copiar. Selecione e copie o link.");
          }
        }}
      >
        Copiar link
      </Button>
    </div>
  );
}
