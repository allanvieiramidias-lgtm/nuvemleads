"use client";

import { useEffect } from "react";

/**
 * Teclado virtual (README §"Mobile"). No Chrome do Android a meta viewport
 * `interactive-widget=resizes-content` já encolhe a página. O Safari do iPhone ignora essa
 * opção e só encolhe a "viewport visual": aqui a conversa passa a ter a altura da área visível
 * (`--nl-vvh`) e a página volta ao topo, para o campo de mensagem ficar logo acima do teclado.
 */
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--nl-vvh", `${Math.round(vv.height)}px`);
        if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
      });
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--nl-vvh");
    };
  }, []);
}
