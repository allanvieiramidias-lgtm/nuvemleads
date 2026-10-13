import type { MetadataRoute } from "next";

// Manifest mínimo (Etapa 9): só nome, cores e ícones. Sem service worker (CLAUDE.md: nada de cache de mensagens).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NuvemLeads",
    short_name: "NuvemLeads",
    start_url: "/",
    display: "standalone",
    background_color: "#161826", // = --color-bg (o manifest não aceita variáveis CSS)
    theme_color: "#161826",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
  };
}
