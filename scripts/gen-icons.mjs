// Gera os ícones PNG a partir do símbolo (README §"Logo/símbolo/favicon").
// Uso: node scripts/gen-icons.mjs  — rode de novo só se o símbolo mudar.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg", "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");
// Ícone da tela inicial do iPhone: o sistema arredonda os cantos, então o fundo vai até a borda.
const square = svg.replace(/<rect width="32" height="32" rx="8"/, '<rect width="32" height="32"');

async function png(src, size, out) {
  const buf = await sharp(Buffer.from(src), { density: (72 * size) / 32 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(out, buf);
  console.log(out, size);
}

await png(square, 180, "src/app/apple-icon.png");
await png(svg, 192, "public/icon-192.png");
await png(svg, 512, "public/icon-512.png");
