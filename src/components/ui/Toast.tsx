"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error";
type ToastItem = { id: number; tone: ToastTone; text: string };

type ToastApi = {
  success: (text: string) => void;
  error: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = 2800;

/** README §4.11: centralizado, 96px acima da base, some após 2,8 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, text: string) => {
    const id = nextId.current++;
    // Um toast por vez, como no protótipo: o novo substitui o anterior.
    setItems([{ id, tone, text }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), DURATION_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (t) => push("success", t), error: (t) => push("error", t) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="nl-toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="nl-toast" data-tone={t.tone}>
            {t.tone === "success" ? (
              <CheckCircleIcon size={17} weight="fill" aria-hidden />
            ) : (
              <WarningCircleIcon size={17} weight="fill" aria-hidden />
            )}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}
