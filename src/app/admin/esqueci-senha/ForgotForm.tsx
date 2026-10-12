"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorBanner, SuccessBanner } from "@/components/admin/Banner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api-client";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api("/api/admin/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo deu errado. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      <div>
        <h3 className="mb-1.5">Esqueci minha senha</h3>
        <p className="m-0 text-[14px] text-[var(--color-neutral-400)]">
          Informe o e-mail do administrador. Enviaremos um link para criar uma nova senha.
        </p>
      </div>
      {sent ? (
        <SuccessBanner>
          Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. O
          link vale por 30 minutos.
        </SuccessBanner>
      ) : (
        <>
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
          <Button
            type="submit"
            variant="primary"
            block
            large
            loading={loading}
            loadingText="Enviando…"
          >
            Enviar link
          </Button>
        </>
      )}
      <div>
        <Link href="/admin/login" className="btn btn-ghost text-[13px] no-underline">
          <ArrowLeftIcon size={14} aria-hidden />
          Voltar para o login
        </Link>
      </div>
    </form>
  );
}
