"use client";

import { SignOutIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      icon={<SignOutIcon size={16} aria-hidden />}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await api("/api/admin/logout").catch(() => null);
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}
