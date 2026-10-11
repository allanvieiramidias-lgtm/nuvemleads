"use client";

import * as S from "@radix-ui/react-switch";

/** README §4.10: 40×24; `role="switch"` e `aria-checked` vêm do Radix. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Rótulo acessível quando não houver <label htmlFor>. */
  label?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <S.Root
      id={id}
      className="nl-switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
    >
      <S.Thumb className="nl-switch-thumb" />
    </S.Root>
  );
}
