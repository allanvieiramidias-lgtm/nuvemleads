import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Inter hospedada junto com o app (sem chamadas ao Google). O subconjunto latin cobre o português.
const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "sans-serif"],
});

// Título fixo e neutro: nunca nome do contato nem prévia de mensagem (ARQUITETURA §7)
export const metadata: Metadata = {
  title: "NuvemLeads",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#161826", // = --color-bg (a meta theme-color não aceita variáveis CSS)
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Toda página é montada na hora: só assim cada resposta recebe o próprio nonce da CSP
  // (uma página estática levaria scripts sem nonce e seria bloqueada).
  await connection();
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
