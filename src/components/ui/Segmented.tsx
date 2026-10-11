"use client";

import { useId } from "react";

export type SegmentedOption<T extends string> = { value: T; label: string };

/** `.seg` do Nocturne como grupo de rádio (teclado: setas entre as opções). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  name,
  disabled,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Rótulo acessível do grupo. */
  label: string;
  name?: string;
  disabled?: boolean;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <div className="seg" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {options.map((o) => (
        <label key={o.value} className="seg-opt">
          <input
            type="radio"
            name={groupName}
            value={o.value}
            checked={o.value === value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
