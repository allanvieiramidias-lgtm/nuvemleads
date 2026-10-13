import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { participantFor } from "./env";

// Camada de bloqueio (README §4.4 e §5, DECISOES §4–§7). Só no desktop, com a Maria.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "bloqueio roda no desktop (a conversa é compartilhada)");

let ipN = 0;
async function enter(context: BrowserContext, page: Page) {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.70.0.${++ipN}` });
  const p = participantFor("desktop");
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  return p;
}

const heading = (page: Page) => page.getByRole("heading", { name: "Sessão bloqueada" });

async function hideTab(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function showTab(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function unlock(page: Page, pin: string) {
  await page.getByLabel("PIN de 6 dígitos").fill(pin);
  await expect(page.getByText("PIN correto. Abrindo conversa…")).toBeVisible();
  await expect(page.getByLabel("Mensagem")).toBeVisible();
}

test("manual: tela bloqueada sem a conversa no DOM, 423 nas rotas, PIN errado e certo", async ({
  context,
  page,
}) => {
  const p = await enter(context, page);
  await page.getByLabel("Mensagem").fill("Mensagem antes de bloquear");
  await page.keyboard.press("Enter");
  await expect(page.locator(".nl-msg", { hasText: "Mensagem antes de bloquear" })).toHaveAttribute(
    "data-status",
    /sent|delivered|read/,
  );

  await page.getByRole("button", { name: "Bloquear" }).click();
  await expect(heading(page)).toBeVisible();
  await expect(page.getByText("Por segurança, sua conversa foi ocultada.")).toBeVisible();
  await expect(page.getByText(/^Sessão de Maria Clara · bloqueada às \d\d:\d\d/)).toBeVisible();
  await expect(page.getByText("Bloqueada manualmente.")).toBeVisible();
  // a conversa não existe mais na página (não é um modal por cima)
  await expect(page.locator(".nl-msg")).toHaveCount(0);
  expect(await page.content()).not.toContain("Mensagem antes de bloquear");
  await expect.poll(async () => (await page.request.get("/api/messages")).status()).toBe(423);
  await expect(page).toHaveTitle("NuvemLeads");

  await page.getByLabel("PIN de 6 dígitos").fill("000001");
  await expect(page.getByText("PIN incorreto. Tente novamente.")).toBeVisible();
  await unlock(page, p.pin);
  // recarregou do servidor
  await expect(page.locator(".nl-msg", { hasText: "Mensagem antes de bloquear" })).toBeVisible();
  expect((await page.request.get("/api/messages")).status()).toBe(200);
});

test("trocar de aba bloqueia na hora, com véu", async ({ context, page }) => {
  const p = await enter(context, page);
  await hideTab(page);
  expect(await page.evaluate(() => document.documentElement.dataset.veil)).toBe("on");
  await expect(heading(page)).toBeAttached();
  await showTab(page);
  await expect(heading(page)).toBeVisible();
  await expect(page.getByText("Você saiu da aba do navegador.")).toBeVisible();
  await unlock(page, p.pin);
  expect(await page.evaluate(() => document.documentElement.dataset.veil)).toBeUndefined();
});

test("perder o foco: tolera 1,5 s; depois bloqueia", async ({ context, page }) => {
  const p = await enter(context, page);
  // volta antes de 1,5 s: não bloqueia
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1500);
  await expect(page.getByLabel("Mensagem")).toBeVisible();

  // não volta: bloqueia com o motivo certo
  await page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });
  await expect(heading(page)).toBeVisible({ timeout: 4000 });
  await expect(page.getByText("A janela do navegador perdeu o foco.")).toBeVisible();
  await page.evaluate(() => {
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
  });
  await unlock(page, p.pin);
});

test("inatividade pelo tempo configurado (relógio falso)", async ({ context, page }) => {
  await page.clock.install();
  const p = await enter(context, page);
  await page.clock.fastForward("04:50");
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  await page.clock.fastForward("00:15");
  await expect(heading(page)).toBeVisible();
  await expect(page.getByText("Sem atividade por 5 min.")).toBeVisible();
  await unlock(page, p.pin);
});

test("bloquear numa aba bloqueia as outras da mesma pessoa", async ({ context, page }) => {
  await enter(context, page);
  const other = await context.newPage();
  await other.goto("/chat");
  // a página reaberta começa bloqueada (DECISOES §7); desbloqueia nela
  await expect(heading(other)).toBeVisible();
  await unlock(other, participantFor("desktop").pin);
  // a primeira aba foi "assumida" pela segunda (DECISOES §6)
  await expect(page.getByText("A conversa está aberta em outra aba.")).toBeVisible();
  await page.getByRole("button", { name: "Usar esta aba" }).click();
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  await expect(other.getByText("A conversa está aberta em outra aba.")).toBeVisible();
  // bloqueio vale para todas
  await page.getByRole("button", { name: "Bloquear" }).click();
  await expect(heading(page)).toBeVisible();
  await expect(heading(other)).toBeVisible();
  await other.close();
});

test("seletor de arquivo aberto: véu, mas sem bloquear; volta com o arquivo", async ({
  context,
  page,
}) => {
  await enter(context, page);
  await page.getByRole("button", { name: "Anexar" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /Foto ou vídeo/ }).click();
  const fc = await chooser;
  // no celular, abrir a galeria/câmera tira a página de vista
  await hideTab(page);
  expect(await page.evaluate(() => document.documentElement.dataset.veil)).toBe("on");
  await expect(page.getByLabel("Mensagem")).toBeAttached(); // não desmontou
  await showTab(page);
  await fc.setFiles("scripts/demo/photo.jpg");
  await expect(page.getByRole("dialog", { name: "Enviar imagem" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.veil)).toBeUndefined();
  await page.getByRole("button", { name: "Cancelar" }).click();
  // depois de escolher, sair da aba volta a bloquear
  await hideTab(page);
  await showTab(page);
  await expect(heading(page)).toBeVisible();
});
