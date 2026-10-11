"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  /** Campo de PIN: espaçamento .3em, numérico (README §4.9). */
  pin?: boolean;
  ref?: Ref<HTMLInputElement>;
};

/** `.field` + `.input` do Nocturne com estado de erro e mensagem (README §4.9). */
export function Input({ label, error, hint, pin, id, className, ref, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-erro`;
  const hintId = `${inputId}-dica`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="field">
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      <input
        ref={ref}
        id={inputId}
        className={cn("input", pin && "input-pin", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...(pin
          ? { type: "password", inputMode: "numeric" as const, maxLength: 6, autoComplete: "off" }
          : {})}
        {...rest}
      />
      {error ? (
        <div id={errorId} className="nl-field-error" role="alert">
          {error}
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className="nl-field-hint">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
