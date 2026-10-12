"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorBanner, SuccessBanner } from "@/components/admin/Banner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api-client";
import { MSG } from "@/lib/validators";

const MISMATCH = "As senhas não coincidem.";

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const next: typeof errors = {};
    if (password.length < 10) next.password = MSG.passwordShort;
    if (confirm !== password) next.confirm = MISMATCH;
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      await api("/api/admin/password/reset", { token, password });
      setDone(true);
    } catch (err) {
      setErrors({
        form: err instanceof ApiError ? err.message : "Algo deu errado. Tente de novo.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <>
        <SuccessBanner>Senha alterada. Entre com a nova senha.</SuccessBanner>
        <Link href="/admin/login" className="btn btn-primary btn-block btn-lg no-underline">
          Ir para o login
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="contents">
      {errors.form ? <ErrorBanner>{errors.form}</ErrorBanner> : null}
      <Input
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setErrors((x) => ({ ...x, password: undefined, form: undefined }));
        }}
        error={errors.password}
        hint={errors.password ? undefined : "Mínimo de 10 caracteres."}
        autoFocus
      />
      <Input
        label="Confirmar senha"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          setErrors((x) => ({ ...x, confirm: undefined, form: undefined }));
        }}
        error={errors.confirm}
      />
      <Button type="submit" variant="primary" block large loading={loading} loadingText="Salvando…">
        Salvar nova senha
      </Button>
    </form>
  );
}
