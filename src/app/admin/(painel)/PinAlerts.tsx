"use client";

import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api-client";

/** DECISOES §8: "Muitas tentativas de PIN para Maria" + "Liberar tentativas". */
export function PinAlerts({ alerts }: { alerts: { userId: string; firstName: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!alerts.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((a) => (
        <div key={a.userId} className="nl-alert-warning" role="status">
          <WarningCircleIcon size={17} weight="fill" aria-hidden />
          <span className="flex-1">Muitas tentativas de PIN para {a.firstName}</span>
          <Button
            variant="secondary"
            loading={busy === a.userId}
            onClick={async () => {
              setBusy(a.userId);
              try {
                await api(`/api/admin/users/${a.userId}/pin-attempts/reset`);
                toast.success("Tentativas liberadas.");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Não foi possível liberar.");
              } finally {
                setBusy(null);
              }
            }}
          >
            Liberar tentativas
          </Button>
        </div>
      ))}
    </div>
  );
}
