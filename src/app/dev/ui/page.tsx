import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Showcase } from "./Showcase";

export const metadata: Metadata = { title: "NuvemLeads" };

const swatches: { name: string; token: string; css: string; value: string }[] = [
  { name: "Primary", token: "--color-accent", css: "var(--color-accent)", value: "#9184D9" },
  {
    name: "Primary Hover",
    token: "--color-accent-400",
    css: "var(--color-accent-400)",
    value: "#B5ABFC",
  },
  { name: "Background", token: "--color-bg", css: "var(--color-bg)", value: "#161826" },
  { name: "Surface", token: "--color-surface", css: "var(--color-surface)", value: "#232532" },
  {
    name: "Surface Secondary",
    token: "--color-neutral-900",
    css: "var(--color-neutral-900)",
    value: "#292B31",
  },
  { name: "Text Primary", token: "--color-text", css: "var(--color-text)", value: "#E9E9ED" },
  {
    name: "Text Secondary",
    token: "--color-neutral-500",
    css: "var(--color-neutral-500)",
    value: "#9397AB",
  },
  { name: "Border", token: "--color-divider", css: "var(--color-divider)", value: "text · 16%" },
  { name: "Success", token: "--nl-success", css: "var(--nl-success)", value: "oklch .76 .13 158" },
  { name: "Warning", token: "--nl-warning", css: "var(--nl-warning)", value: "oklch .82 .12 80" },
  { name: "Error", token: "--nl-error", css: "var(--nl-error)", value: "oklch .72 .15 22" },
  { name: "Online", token: "--nl-online", css: "var(--nl-online)", value: "= Success" },
  {
    name: "Message Sent",
    token: "--color-accent-800",
    css: "var(--color-accent-800)",
    value: "#423A6A",
  },
  {
    name: "Message Received",
    token: "--color-surface",
    css: "var(--color-surface)",
    value: "#232532",
  },
];

const type: { label: string; sample: string; style: React.CSSProperties }[] = [
  {
    label: "Display · 42/500",
    sample: "Sessão bloqueada",
    style: { fontSize: 42, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1 },
  },
  {
    label: "Heading · 25/500",
    sample: "Digite seu PIN",
    style: { fontSize: 25, fontWeight: 500, letterSpacing: "-0.015em" },
  },
  {
    label: "Body · 15/400",
    sample: "Por segurança, sua conversa foi ocultada.",
    style: { fontSize: 15 },
  },
  {
    label: "Caption · 12/400",
    sample: "Visto por último hoje às 09:40",
    style: { fontSize: 12, color: "var(--color-neutral-400)" },
  },
  {
    label: "Label · 11/500 caps",
    sample: "Hoje",
    style: {
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: ".08em",
      textTransform: "uppercase",
      color: "var(--color-neutral-400)",
    },
  },
];

/** Referência visual dos componentes (só em desenvolvimento). Espelha a tela "Design system" do protótipo. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="flex max-w-[1120px] flex-col gap-12 px-8 pt-10 pb-20 max-[699px]:px-4">
      <div>
        <div className="nl-kicker mb-2">NuvemLeads · Design system</div>
        <h1 className="mb-2">Sistema visual</h1>
        <p className="m-0 max-w-[560px] text-[var(--color-neutral-400)]">
          Construído sobre o Nocturne: fundo azul-acinzentado, Inter 500, raio 8px e o acento usado
          como linha e brilho. Todos os valores abaixo são tokens do stylesheet.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h6 className="text-[var(--color-neutral-500)]">Identidade</h6>
        <div className="flex flex-wrap items-stretch gap-4">
          <div
            className="card elev-sm min-w-0 justify-center p-8 max-[699px]:p-5"
            style={{ flex: "2 1 300px", gap: 16 }}
          >
            <Logo size={64} fontSize={40} />
            <p className="m-0 max-w-[440px] text-[13px] text-[var(--color-neutral-400)]">
              Uma nuvem que também é um balão de conversa. O ponto com haste no centro sugere uma
              fechadura sem desenhar um cadeado.
            </p>
          </div>
          <div
            className="card elev-sm min-w-0 p-6 max-[699px]:p-5"
            style={{ flex: "1 1 260px", gap: 16 }}
          >
            <div className="card-kicker">Símbolo e favicon</div>
            <div className="flex items-end gap-5">
              <div className="grid size-[72px] place-items-center rounded-[16px] bg-[var(--color-bg)] shadow-[var(--shadow-sm)]">
                <LogoMark size={48} />
              </div>
              <LogoMark size={32} />
              <LogoMark size={16} />
            </div>
            <div className="card-meta">72 · 32 · 16 px — src/app/icon.svg</div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h6 className="text-[var(--color-neutral-500)]">Cores</h6>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
        >
          {swatches.map((c) => (
            <div key={c.name} className="flex flex-col gap-2">
              <div
                className="h-16 rounded-[var(--radius-md)]"
                style={{
                  background: c.css,
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in srgb, var(--color-text) 10%, transparent)",
                }}
              />
              <div>
                <div className="text-[13px] font-medium">{c.name}</div>
                <div className="text-[11.5px] text-[var(--color-neutral-500)]">{c.token}</div>
                <div className="text-[11.5px] text-[var(--color-neutral-600)]">{c.value}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="m-0 max-w-[640px] text-[12.5px] text-[var(--color-neutral-500)]">
          Success, Warning e Error são os únicos tons fora do Nocturne, definidos em OKLCH na mesma
          luminosidade do acento. Aparecem só em pontos, ícones e textos curtos de estado.
        </p>
      </section>

      <section className="flex flex-col gap-3.5">
        <h6 className="text-[var(--color-neutral-500)]">Tipografia — Inter</h6>
        <div
          className="grid items-baseline gap-x-6 gap-y-3.5"
          style={{ gridTemplateColumns: "140px 1fr" }}
        >
          {type.map((t) => (
            <div key={t.label} className="contents">
              <div className="text-[12px] text-[var(--color-neutral-500)]">{t.label}</div>
              <div style={t.style}>{t.sample}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h6 className="text-[var(--color-neutral-500)]">Componentes</h6>
        <Showcase />
      </section>
    </main>
  );
}
