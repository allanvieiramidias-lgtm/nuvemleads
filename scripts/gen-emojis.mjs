// Gera src/components/chat/emoji-data.ts a partir do Emojibase (nomes em português).
// Uso: node scripts/gen-emojis.mjs — rode de novo só ao atualizar o emojibase-data.
// Só emojis até a versão 15.0 do Unicode, para aparecerem certo nos celulares dos últimos anos
// (os mais novos viram um quadrado em aparelhos antigos). Sem tons de pele: o padrão amarelo.
import { readFileSync, writeFileSync } from "node:fs";

const compact = JSON.parse(readFileSync("node_modules/emojibase-data/pt/compact.json", "utf8"));
const full = JSON.parse(readFileSync("node_modules/emojibase-data/pt/data.json", "utf8"));
const version = new Map(full.map((e) => [e.hexcode, Number(e.version)]));
const MAX_VERSION = 15.0;

// Rótulos próprios (o do Emojibase para bandeiras está errado em pt: "comutadores").
const GROUPS = [
  [0, "carinhas", "Carinhas e emoções", "😊"],
  [1, "pessoas", "Pessoas e corpo", "👋"],
  [3, "natureza", "Animais e natureza", "🐶"],
  [4, "comida", "Comida e bebida", "🍕"],
  [5, "lugares", "Viagens e lugares", "✈️"],
  [6, "atividades", "Atividades", "⚽"],
  [7, "objetos", "Objetos", "💡"],
  [8, "simbolos", "Símbolos", "❤️"],
  [9, "bandeiras", "Bandeiras", "🏳️"],
];

const groups = GROUPS.map(([g, id, label, icon]) => ({
  id,
  label,
  icon,
  items: compact
    .filter((e) => e.group === g && (version.get(e.hexcode) ?? 99) <= MAX_VERSION)
    .sort((a, b) => a.order - b.order)
    .map((e) => [e.unicode, e.label]),
}));

const total = groups.reduce((n, g) => n + g.items.length, 0);
const out = `// Gerado por scripts/gen-emojis.mjs (emojibase-data, Unicode até ${MAX_VERSION}). Não edite à mão.
// ${total} emojis em ${groups.length} categorias.
export type EmojiGroup = { id: string; label: string; icon: string; items: [string, string][] };

export const EMOJI_GROUPS: EmojiGroup[] = ${JSON.stringify(groups)};
`;
writeFileSync("src/components/chat/emoji-data.ts", out);
console.log(`${total} emojis`, groups.map((g) => `${g.id}:${g.items.length}`).join(" "));
