"use client";

import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

/** Coloque uma vez perto da raiz da árvore de cliente. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

/** README §4.11: 11.5px, neutral-800, raio 4, padding 4px 8px, 6px acima do alvo. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content className="nl-tooltip" side="top" sideOffset={6}>
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
