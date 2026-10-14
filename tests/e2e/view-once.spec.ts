import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E, participantFor, PARTICIPANTS } from "./env";

// DECISOES §30: visualização única (texto e mídia) e painel de mídias. Só no desktop.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "conversa compartilhada: roda no desktop");

let ipN = 0;
async function open(browser: Browser, who: "maria" | "allan") {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "x-forwarded-for": `10.98.0.${++ipN}` },
  });
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

const onceBubbles = (page: Page) => page.locator(".nl-bubble[data-once]");

test("texto de visualização única: some depois de aberto, para os dois", async ({ browser }) => {
  const maria = await open(browser, "maria");
  const allan = await open(browser, "allan");
  const secret = `Segredo ${Date.now()}`;

  await maria.page.getByRole("button", { name: "Ver uma vez" }).click();
  await expect(maria.page.getByRole("button", { name: "Ver uma vez" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(maria.page.getByText("Visualização única: a próxima mensagem some")).toBeVisible();
  await maria.page.getByLabel("Mensagem").fill(secret);
  await maria.page.keyboard.press("Enter");
  // o botão desliga sozinho depois de enviar
  await expect(maria.page.getByRole("button", { name: "Ver uma vez" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(onceBubbles(maria.page).last()).toContainText("Mensagem · visualização única");

  const openBtn = allan.page.getByRole("button", { name: /Mensagem de visualização única/ });
  await expect(openBtn.last()).toBeVisible();
  expect(await allan.page.content()).not.toContain(secret);

  await openBtn.last().click();
  const dialog = allan.page.getByRole("dialog", { name: "Mensagem de visualização única" });
  await expect(dialog.getByText(secret)).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).last().click();
  await expect(dialog).toBeHidden();
  expect(await allan.page.content()).not.toContain(secret);
  await expect(onceBubbles(allan.page).last()).toContainText("Aberta");
  await expect(onceBubbles(maria.page).last()).toContainText("Aberta");

  // nem recarregando volta
  await allan.page.reload();
  await expect(allan.page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  await allan.page.getByLabel("PIN de 6 dígitos").fill(PARTICIPANTS[1].pin);
  await expect(allan.page.getByLabel("Mensagem")).toBeVisible();
  expect(await allan.page.content()).not.toContain(secret);
  await maria.ctx.close();
  await allan.ctx.close();
});

test("foto de visualização única: abre uma vez e o arquivo some do servidor", async ({
  browser,
}) => {
  const maria = await open(browser, "maria");
  const allan = await open(browser, "allan");

  await maria.page.getByRole("button", { name: "Anexar" }).click();
  const chooser = maria.page.waitForEvent("filechooser");
  await maria.page.getByRole("menuitem", { name: /Foto ou vídeo/ }).click();
  await (await chooser).setFiles("scripts/demo/photo.jpg");
  const draft = maria.page.getByRole("dialog", { name: "Enviar imagem" });
  await draft.getByRole("switch", { name: "Ver uma vez" }).click();
  await draft.getByRole("button", { name: "Enviar" }).click();
  await expect(draft).toBeHidden();
  await expect(onceBubbles(maria.page).last()).toContainText("Foto · visualização única");
  await expect(onceBubbles(maria.page).last().locator("img")).toHaveCount(0); // nem quem enviou vê

  const openBtn = allan.page.getByRole("button", { name: /Foto de visualização única/ });
  await openBtn.last().click();
  const viewer = allan.page.getByRole("dialog", { name: "Foto de visualização única" });
  const img = viewer.getByRole("img", { name: "Foto de visualização única" });
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const src = await img.getAttribute("src");
  expect(src).toMatch(/^\/api\/media\/[0-9a-f-]{36}$/);
  expect((await allan.page.request.get(`${src}/download`)).status()).toBe(404);
  expect((await allan.page.request.get(`${src}/thumb`)).status()).toBe(404);
  expect((await maria.page.request.get(src!)).status()).toBe(404);

  await viewer.getByRole("button", { name: "Fechar" }).last().click();
  await expect(onceBubbles(allan.page).last()).toContainText("Aberta");
  await expect.poll(async () => (await allan.page.request.get(src!)).status()).toBe(404);
  await maria.ctx.close();
  await allan.ctx.close();
});

test("painel de mídias: só números, limpeza automática e prévia da limpeza manual", async ({
  browser,
}) => {
  // uma foto comum para haver o que contar
  const maria = await open(browser, "maria");
  await maria.page.getByRole("button", { name: "Anexar" }).click();
  const chooser = maria.page.waitForEvent("filechooser");
  await maria.page.getByRole("menuitem", { name: /Foto ou vídeo/ }).click();
  await (await chooser).setFiles("scripts/demo/photo.jpg");
  await maria.page
    .getByRole("dialog", { name: "Enviar imagem" })
    .getByRole("button", { name: "Enviar" })
    .click();
  await expect(maria.page.locator(".nl-msg").last()).toHaveAttribute(
    "data-status",
    /sent|delivered|read/,
  );
  await maria.ctx.close();

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-forwarded-for": "10.98.1.1" },
  });
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(E2E.adminEmail);
  await page.getByLabel("Senha").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.locator(".nl-admin-side").getByRole("link", { name: "Mídias" }).click();
  await expect(page.getByRole("heading", { name: "Mídias" })).toBeVisible();
  await expect(page.locator(".nl-stat-head", { hasText: "Espaço usado" })).toBeVisible();
  await expect(page.locator(".nl-stat-head", { hasText: "Fotos" })).toBeVisible();
  // nenhuma miniatura nem nome de arquivo
  await expect(page.locator("main img")).toHaveCount(0);
  expect(await page.content()).not.toContain("photo.jpg");

  // limpeza automática
  const group = page.getByRole("radiogroup", { name: "Apagar mídias com mais de" });
  await group.getByText("1 ano").click();
  await page.getByRole("button", { name: "Salvar limpeza automática" }).click();
  await expect(page.getByText("Limpeza automática salva. Ela roda a cada hora.")).toBeVisible();
  await page.reload();
  await expect(group.getByRole("radio", { name: "1 ano" })).toBeChecked();
  await group.getByText("Nunca").click();
  await page.getByRole("button", { name: "Salvar limpeza automática" }).click();
  await expect(page.getByText("Limpeza automática desligada.")).toBeVisible();

  // limpeza manual: nada antes de 2000; depois de amanhã há fotos → confirmação (cancelada)
  await page.getByLabel("Apagar mídias enviadas antes de").fill("2000-01-01");
  await page.getByRole("button", { name: "Apagar mídias…" }).click();
  await expect(page.getByText("Nenhuma mídia guardada antes dessa data")).toBeVisible();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Apagar mídias enviadas antes de").fill(tomorrow);
  for (const k of ["Vídeos", "Áudios", "Arquivos"]) await page.getByLabel(k).uncheck();
  await page.getByRole("button", { name: "Apagar mídias…" }).click();
  const confirm = page.getByRole("dialog", { name: /^Apagar \d+ mídias?\?$/ });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/não podem ser recuperadas/)).toBeVisible();
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toBeHidden();
  await ctx.close();
});
