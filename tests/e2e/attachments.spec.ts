import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { participantFor, PARTICIPANTS } from "./env";

// Anexos entre dois navegadores. Só no desktop (a conversa é compartilhada).
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "anexos entre dois navegadores rodam só no desktop");
// Microfone simulado para a gravação de áudio
test.use({
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

const FIX = path.resolve(".data/e2e-fixtures");
test.beforeAll(async () => {
  mkdirSync(FIX, { recursive: true });
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=10:duration=2",
    "-c:v",
    "libvpx",
    "-b:v",
    "300k",
    path.join(FIX, "clipe.webm"),
  ]);
  writeFileSync(
    path.join(FIX, "Contrato.pdf"),
    "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  );
  writeFileSync(path.join(FIX, "grande.bin"), Buffer.alloc(26 * 1024 * 1024, 7));
  writeFileSync(path.join(FIX, "script.sh"), "echo oi\n");
  writeFileSync(
    path.join(FIX, "anim.gif"),
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
      .gif()
      .toBuffer(),
  );
});

async function open(browser: Browser, who: "maria" | "allan", ip: string) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  await ctx.grantPermissions(["microphone"]);
  const page = await ctx.newPage();
  const p =
    who === "maria"
      ? participantFor("desktop")
      : { ...PARTICIPANTS[1], slug: participantFor("mobile").slug };
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  return { ctx, page };
}

async function pick(page: Page, option: "Foto ou vídeo" | "Arquivo", file: string) {
  await page.getByRole("button", { name: "Anexar" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: new RegExp(option) }).click();
  await (await chooser).setFiles(file);
}

const toast = (page: Page) => page.locator(".nl-toast");

test("foto: prévia com legenda → progresso → chega do outro lado → visualizador com zoom", async ({
  browser,
}) => {
  const maria = await open(browser, "maria", "10.60.0.1");
  const allan = await open(browser, "allan", "10.60.0.2");

  // segura a resposta do envio para ver os estados do progresso
  await maria.page.route("**/api/uploads", async (r) => {
    await new Promise((ok) => setTimeout(ok, 900));
    await r.continue();
  });
  await pick(maria.page, "Foto ou vídeo", "scripts/demo/photo.jpg");
  const dialog = maria.page.getByRole("dialog", { name: "Enviar imagem" });
  await expect(dialog.getByAltText("Prévia da imagem")).toBeVisible();
  await expect(dialog.getByText("photo.jpg")).toBeVisible();
  await dialog.getByLabel("Legenda").fill("A vista daqui de cima");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog).toBeHidden();

  const mine = maria.page.locator(".nl-msg", { hasText: "A vista daqui de cima" });
  await expect(mine.locator(".nl-progress")).toBeVisible();
  await expect(mine.getByText("Concluído")).toBeVisible();
  await expect(mine.locator(".nl-progress")).toBeHidden();

  const theirs = allan.page.locator(".nl-msg", { hasText: "A vista daqui de cima" });
  await expect(theirs.locator("img")).toBeVisible();
  await theirs.getByRole("button", { name: /Abrir imagem/ }).click();
  const viewer = allan.page.getByRole("dialog", { name: "photo.jpg" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(/Maria Clara · Hoje, \d\d:\d\d/)).toBeVisible();
  await expect(viewer.getByText("100%")).toBeVisible();
  await viewer.getByRole("button", { name: "Aumentar zoom" }).click();
  await expect(viewer.getByText("150%")).toBeVisible();
  const dl = await viewer.getByRole("link", { name: "Baixar" }).getAttribute("href");
  expect(dl).toMatch(/^\/api\/media\/[0-9a-f-]{36}\/download$/);
  await allan.page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await maria.ctx.close();
  await allan.ctx.close();
});

test("arquivo: cartão com tipo e tamanho; download sai como anexo", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.60.0.3");
  const allan = await open(browser, "allan", "10.60.0.4");
  await pick(maria.page, "Arquivo", path.join(FIX, "Contrato.pdf"));
  const dialog = maria.page.getByRole("dialog", { name: "Enviar arquivo" });
  await expect(dialog.getByLabel("Legenda")).toHaveCount(0); // arquivo não tem legenda
  await dialog.getByRole("button", { name: "Enviar" }).click();

  const card = allan.page.locator(".nl-file", { hasText: "Contrato.pdf" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("PDF · 1 KB");
  const href = await card.getByRole("link", { name: "Baixar Contrato.pdf" }).getAttribute("href");
  const res = await allan.page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(res.headers()["cache-control"]).toContain("no-store");
  await maria.ctx.close();
  await allan.ctx.close();
});

test("limites e formatos recusados com aviso", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.60.0.5");
  await pick(maria.page, "Arquivo", path.join(FIX, "grande.bin"));
  await expect(toast(maria.page)).toHaveText("O arquivo excede o limite de 25 MB.");
  await pick(maria.page, "Arquivo", path.join(FIX, "script.sh"));
  await expect(toast(maria.page)).toHaveText("Este tipo de arquivo não é permitido.");
  await pick(maria.page, "Foto ou vídeo", path.join(FIX, "anim.gif"));
  await expect(toast(maria.page)).toHaveText("Formato não suportado. Use JPG, PNG ou WEBP.");
  await expect(maria.page.getByRole("dialog")).toHaveCount(0);
  await maria.ctx.close();
});

test("vídeo: prévia com duração → bolha com capa e duração → player", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.60.0.6");
  const allan = await open(browser, "allan", "10.60.0.7");
  await pick(maria.page, "Foto ou vídeo", path.join(FIX, "clipe.webm"));
  const dialog = maria.page.getByRole("dialog", { name: "Enviar vídeo" });
  await expect(dialog.locator(".nl-dur-chip")).toHaveText("0:02");
  await dialog.getByLabel("Legenda").fill("Clipe curto");
  await dialog.getByRole("button", { name: "Enviar" }).click();

  const theirs = allan.page.locator(".nl-msg", { hasText: "Clipe curto" });
  await expect(theirs.locator(".nl-dur-chip")).toHaveText("0:02");
  await expect(theirs.locator("img")).toBeVisible(); // capa gerada no servidor
  await theirs.getByRole("button", { name: /Reproduzir vídeo/ }).click();
  const viewer = allan.page.getByRole("dialog", { name: "clipe.webm" });
  await expect(viewer.getByText(/\/ 0:02$/)).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Tela cheia" })).toBeVisible();
  await allan.page.keyboard.press("Escape");
  await maria.ctx.close();
  await allan.ctx.close();
});

test("áudio: gravar com o microfone, enviar e tocar do outro lado", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.60.0.8");
  const allan = await open(browser, "allan", "10.60.0.9");
  const before = await allan.page.locator(".nl-audio").count();
  await maria.page.getByRole("button", { name: "Gravar áudio" }).click();
  await expect(maria.page.getByText("Gravando áudio…")).toBeVisible();
  await expect(maria.page.locator(".nl-rec-time")).toHaveText("0:02", { timeout: 6000 });
  await maria.page.getByRole("button", { name: "Enviar áudio" }).click();
  await expect(maria.page.getByText("Gravando áudio…")).toBeHidden();

  await expect(allan.page.locator(".nl-audio")).toHaveCount(before + 1);
  const player = allan.page.locator(".nl-audio").last();
  await expect(player.locator(".nl-times span").last()).toHaveText(/^0:0[2-3]$/);
  await player.getByRole("button", { name: "Tocar áudio" }).click();
  await expect(player.getByRole("button", { name: "Pausar áudio" })).toBeVisible();

  // descartar não envia nada
  await maria.page.getByRole("button", { name: "Gravar áudio" }).click();
  await expect(maria.page.getByText("Gravando áudio…")).toBeVisible();
  await maria.page.getByRole("button", { name: "Descartar gravação" }).click();
  await expect(maria.page.getByLabel("Mensagem")).toBeVisible();
  await maria.page.waitForTimeout(800);
  await expect(allan.page.locator(".nl-audio")).toHaveCount(before + 1);
  await maria.ctx.close();
  await allan.ctx.close();
});

test("bloqueado não acessa a mídia (423)", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.60.0.10");
  const href = await maria.page.locator(".nl-file a").first().getAttribute("href");
  expect((await maria.page.request.get(href!)).status()).toBe(200);
  await maria.page.getByRole("button", { name: "Bloquear" }).click();
  await expect(maria.page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  expect((await maria.page.request.get(href!)).status()).toBe(423);
  await maria.ctx.close();
});
