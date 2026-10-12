"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorBanner } from "@/components/admin/Banner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api-client";

const GENERIC_ERROR = "Não foi possível entrar. Verifique seus dados.";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) {
      setError(GENERIC_ERROR);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api("/api/admin/login", { email, password });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.code !== "INTERNAL" ? err.message : GENERIC_ERROR);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      <h3 className="m-0">Entrar no NuvemLeads</h3>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <Input
        label="E-mail"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        autoFocus
      />
      <Input
        label="Senha"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
      />
      <Button type="submit" variant="primary" block large loading={loading} loadingText="Entrando…">
        Entrar
      </Button>
      <div className="flex items-center justify-between">
        <Link href="/admin/esqueci-senha" className="btn btn-ghost text-[13px] no-underline">
          Esqueci minha senha
        </Link>
        <Link href="/" className="btn btn-ghost nl-muted-link text-[12.5px] no-underline">
          Acesso do participante
        </Link>
      </div>
    </form>
  );
}
