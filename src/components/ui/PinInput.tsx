"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { cn } from "@/lib/cn";

export type PinState = "idle" | "error" | "success" | "blocked";

export type PinInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Chamado ao completar 6 dígitos ou ao apertar Enter com 6 dígitos. */
  onComplete?: (value: string) => void;
  state?: PinState;
  /** Muda a cada erro para reiniciar o tremor (ex.: número de tentativas). */
  errorKey?: number;
  autoFocus?: boolean;
  label?: string;
  id?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

const LENGTH = 6;

/**
 * README §4.2. Seis caixas com um <input type="password"> invisível por cima,
 * que captura teclado, colar e o preenchimento automático do celular.
 */
export function PinInput({
  value,
  onChange,
  onComplete,
  state = "idle",
  errorKey = 0,
  autoFocus = false,
  label = "PIN de 6 dígitos",
  id,
  className,
  ref,
}: PinInputProps) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const locked = state === "blocked" || state === "success";

  // Tremor alterna entre duas animações iguais para reiniciar a cada erro.
  const shake = state === "error" ? (errorKey % 2 ? "a" : "b") : undefined;

  useEffect(() => {
    if (!locked && autoFocus) innerRef.current?.focus();
  }, [locked, autoFocus]);

  function setRefs(node: HTMLInputElement | null) {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, LENGTH);
    onChange(digits);
    if (digits.length === LENGTH && digits !== value) onComplete?.(digits);
  }

  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <div
      className={cn("nl-pin", className)}
      data-state={state}
      data-shake={shake}
      onClick={() => innerRef.current?.focus()}
    >
      {Array.from({ length: LENGTH }, (_, i) => (
        <div
          key={i}
          className="nl-pin-box"
          data-filled={i < value.length || undefined}
          data-active={(focused && !locked && i === activeIndex) || undefined}
          aria-hidden
        >
          <span className="nl-pin-dot" />
        </div>
      ))}
      <input
        ref={setRefs}
        id={id}
        className="nl-pin-input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        aria-label={label}
        aria-invalid={state === "error" || undefined}
        disabled={locked}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length === LENGTH) onComplete?.(value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

/** Linha de estado abaixo do PIN (altura mínima 20px, README §4.2). */
export function PinMessage({
  tone,
  children,
}: {
  tone?: "error" | "warning" | "success";
  children?: React.ReactNode;
}) {
  return (
    <div className="nl-pin-message" data-tone={tone} role="status" aria-live="polite">
      {children}
    </div>
  );
}
