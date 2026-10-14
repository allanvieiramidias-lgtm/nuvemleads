"use client";

import {
  AirplaneIcon,
  ClockIcon,
  FlagIcon,
  ForkKnifeIcon,
  HandWavingIcon,
  HeartIcon,
  LightbulbIcon,
  PawPrintIcon,
  SmileyIcon,
  SoccerBallIcon,
} from "@phosphor-icons/react/ssr";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EMOJI_GROUPS } from "./emoji-data";

/** Os 24 de sempre, no topo (README §4.3). Não é sticker nem GIF. */
export const FREQUENT = [
  "😊",
  "😂",
  "❤️",
  "👍",
  "🙏",
  "😍",
  "😉",
  "👏",
  "🔥",
  "✨",
  "😅",
  "🤔",
  "😢",
  "😮",
  "👀",
  "✅",
  "🎉",
  "☕",
  "🌙",
  "☁️",
  "💬",
  "🙌",
  "😴",
  "👋",
];

const ICONS: Record<string, typeof SmileyIcon> = {
  frequentes: ClockIcon,
  carinhas: SmileyIcon,
  pessoas: HandWavingIcon,
  natureza: PawPrintIcon,
  comida: ForkKnifeIcon,
  lugares: AirplaneIcon,
  atividades: SoccerBallIcon,
  objetos: LightbulbIcon,
  simbolos: HeartIcon,
  bandeiras: FlagIcon,
};

const COLS = 8;

/**
 * Catálogo completo (DECISOES §29): abas por categoria e uma grade que rola. Pelo teclado,
 * Tab entra na grade uma vez e as setas andam entre os emojis; Esc fecha.
 */
export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("frequentes");
  // Depois de tocar numa aba, a rolagem suave não troca a aba no meio do caminho.
  const pinned = useRef(false);

  const sections = useMemo(() => {
    const names = new Map<string, string>();
    for (const g of EMOJI_GROUPS) for (const [e, n] of g.items) names.set(e, n);
    const frequent: [string, string][] = FREQUENT.map((e) => [e, names.get(e) ?? e]);
    return [{ id: "frequentes", label: "Mais usados", items: frequent }, ...EMOJI_GROUPS];
  }, []);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(".nl-emoji-grid button")?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest("[data-emoji-toggle]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  // Aba ativa acompanha a rolagem: a última seção cujo início já passou do topo da grade.
  function onScroll() {
    const grid = gridRef.current;
    if (!grid || pinned.current) return;
    let current = "frequentes";
    grid.querySelectorAll<HTMLElement>("[data-section]").forEach((sec) => {
      if (sec.offsetTop - grid.offsetTop <= grid.scrollTop + 8) current = sec.dataset.section!;
    });
    setActive(current);
  }

  function go(id: string) {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!el || !gridRef.current) return;
    pinned.current = true;
    setTimeout(() => (pinned.current = false), 700);
    gridRef.current.scrollTop = el.offsetTop - gridRef.current.offsetTop;
    setActive(id);
  }

  // Foco itinerante: só um emoji fica na ordem do Tab; as setas movem entre eles.
  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLS,
      ArrowUp: -COLS,
    };
    let step = steps[e.key];
    if (e.key === "Home") step = -Infinity;
    if (e.key === "End") step = Infinity;
    if (step === undefined) return;
    const all = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = all[Math.max(0, Math.min(all.length - 1, i + step))]!;
    all[i]!.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  }

  let first = true;
  return (
    <div ref={ref} className="nl-emoji-panel" role="dialog" aria-label="Emojis">
      <div className="nl-emoji-tabs" role="toolbar" aria-label="Categorias de emoji">
        {sections.map((s) => {
          const Icon = ICONS[s.id] ?? SmileyIcon;
          return (
            <button
              key={s.id}
              type="button"
              aria-label={s.label}
              title={s.label}
              aria-pressed={active === s.id}
              onClick={() => go(s.id)}
            >
              <Icon size={17} aria-hidden />
            </button>
          );
        })}
      </div>
      <div ref={gridRef} className="nl-emoji-grid" onKeyDown={onGridKey} onScroll={onScroll}>
        {sections.map((s) => (
          <section key={s.id} data-section={s.id} aria-label={s.label}>
            <div className="nl-emoji-title" aria-hidden>
              {s.label}
            </div>
            <div className="nl-emoji-cells">
              {s.items.map(([emoji, name]) => {
                const tabIndex = first ? 0 : -1;
                first = false;
                return (
                  <button
                    key={`${s.id}-${emoji}`}
                    type="button"
                    tabIndex={tabIndex}
                    onClick={() => onPick(emoji)}
                    aria-label={`Inserir ${name}`}
                    title={name}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
