import { expect, test, type Browser, type Page } from "@playwright/test";
import { participantFor, PARTICIPANTS } from "./env";

// DECISOES §31: "Apagar para mim", "Limpar conversa" e "Minha foto". Projeto próprio, antes
// dos testes paralelos, porque limpar a conversa mexe no que as duas pessoas veem.
test.describe.configure({ mode: "serial" });

let ipN = 0;
async function open(browser: Browser, who: "maria" | "allan") {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "x-forwarded-for": `10.97.0.${++ipN}` },
  });
  const page = await ctx.newPage();
  const p =
    who === "maria"
      ? participantFor("desktop")
      : { ...PARTICIPANTS[1], slug: participantFor("mobile").slug };
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  return { ctx, page, pin: p.pin };
}

async function send(page: Page, text: string) {
  await page.getByLabel("Mensagem").fill(text);
  await page.keyboard.press("Enter");
  await expect(page.locator(".nl-msg", { hasText: text }).last()).toHaveAttribute(
    "data-status",
    /sent|delivered|read/,
  );
}

const msg = (page: Page, text: string) => page.locator(".nl-msg", { hasText: text });

test("apagar para mim: some só de um lado (mouse, botão direito e toque longo)", async ({
  browser,
}) => {
  const maria = await open(browser, "maria");
  const allan = await open(browser, "allan");
  const n = Date.now();
  const gone = `Para apagar ${n}`;
  const stays = `Fica ${n}`;
  const touch = `Toque ${n}`;
  await send(maria.page, gone);
  await send(maria.page, stays);
  await send(maria.page, touch);
  await expect(msg(allan.page, touch)).toBeVisible();

  // mouse: "⋯" aparece ao passar sobre o balão
  await msg(maria.page, gone).locator(".nl-bubble").hover();
  await msg(maria.page, gone).getByRole("button", { name: "Mais ações" }).click();
  await maria.page.getByRole("menuitem", { name: "Apagar para mim" }).click();
  const confirm = maria.page.getByRole("dialog", { name: "Apagar para você?" });
  await expect(
    confirm.getByText("A mensagem some só da sua tela. Allan continua vendo."),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Apagar para mim" }).click();
  await expect(maria.page.getByText("Mensagem apagada para você.")).toBeVisible();
  await expect(msg(maria.page, gone)).toHaveCount(0);
  await expect(msg(allan.page, gone)).toBeVisible();

  // nem recarregando volta
  await maria.page.reload();
  await maria.page.getByLabel("PIN de 6 dígitos").fill(maria.pin);
  await expect(msg(maria.page, stays)).toBeVisible();
  await expect(msg(maria.page, gone)).toHaveCount(0);

  // botão direito, do lado de quem recebeu
  await msg(allan.page, stays).locator(".nl-bubble").click({ button: "right" });
  await allan.page.getByRole("menuitem", { name: "Apagar para mim" }).click();
  await allan.page
    .getByRole("dialog", { name: "Apagar para você?" })
    .getByRole("button", { name: "Apagar para mim" })
    .click();
  await expect(msg(allan.page, stays)).toHaveCount(0);
  await expect(msg(maria.page, stays)).toBeVisible();

  // toque longo (meio segundo) abre o mesmo menu
  const bubble = msg(allan.page, touch).locator(".nl-bubble");
  const box = (await bubble.boundingBox())!;
  const at = { clientX: box.x + 10, clientY: box.y + 10, pointerType: "touch", bubbles: true };
  await bubble.dispatchEvent("pointerdown", at);
  await allan.page.waitForTimeout(650);
  await bubble.dispatchEvent("pointerup", at);
  await expect(allan.page.getByRole("menuitem", { name: "Apagar para mim" })).toBeVisible();
  await allan.page.keyboard.press("Escape");
  await expect(msg(allan.page, touch)).toBeVisible();

  await maria.ctx.close();
  await allan.ctx.close();
});

test("limpar conversa: tudo some só para quem limpou; as novas chegam normalmente", async ({
  browser,
}) => {
  const maria = await open(browser, "maria");
  const allan = await open(browser, "allan");
  const before = `Antes da limpeza ${Date.now()}`;
  await send(allan.page, before);
  await expect(msg(maria.page, before)).toBeVisible();

  await maria.page.getByRole("button", { name: "Menu da sessão" }).click();
  await maria.page.getByRole("menuitem", { name: "Limpar conversa" }).click();
  const confirm = maria.page.getByRole("dialog", { name: "Limpar a conversa?" });
  await expect(
    confirm.getByText("Todas as mensagens até agora somem só da sua tela. Allan continua vendo."),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Limpar conversa" }).click();
  await expect(maria.page.getByText("Conversa limpa para você.")).toBeVisible();
  await expect(maria.page.locator(".nl-msg")).toHaveCount(0);
  await expect(msg(allan.page, before)).toBeVisible();

  const after = `Depois da limpeza ${Date.now()}`;
  await send(allan.page, after);
  await expect(msg(maria.page, after)).toBeVisible();
  await maria.page.reload();
  await maria.page.getByLabel("PIN de 6 dígitos").fill(maria.pin);
  await expect(msg(maria.page, after)).toBeVisible();
  await expect(maria.page.locator(".nl-msg")).toHaveCount(1);

  await maria.ctx.close();
  await allan.ctx.close();
});

test("minha foto: trocar e remover aparece na hora para a outra pessoa", async ({ browser }) => {
  const maria = await open(browser, "maria");
  const allan = await open(browser, "allan");
  const contactImg = allan.page.locator(".nl-chat-head .nl-avatar-img");
  await expect(contactImg).toHaveCount(0);

  await maria.page.getByRole("button", { name: "Menu da sessão" }).click();
  await maria.page.getByRole("menuitem", { name: "Minha foto" }).click();
  const dialog = maria.page.getByRole("dialog", { name: "Minha foto" });
  await expect(dialog.getByText("JPG, PNG ou WEBP, até 5 MB.")).toBeVisible();
  const chooser = maria.page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Escolher foto" }).click();
  await (await chooser).setFiles("scripts/demo/photo.jpg");
  await expect(maria.page.getByText("Foto atualizada.")).toBeVisible();
  await expect(dialog.locator(".nl-avatar-img")).toBeVisible();

  await expect(contactImg).toBeVisible();
  await expect
    .poll(() => contactImg.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);

  // a conversa continua desbloqueada depois de escolher o arquivo
  await expect(maria.page.getByLabel("Mensagem")).toBeAttached();
  await dialog.getByRole("button", { name: "Remover foto" }).click();
  await expect(maria.page.getByText("Foto removida.")).toBeVisible();
  await expect(contactImg).toHaveCount(0);
  await dialog.getByRole("button", { name: "Fechar" }).last().click();
  await expect(dialog).toBeHidden();

  // sem sessão não troca
  const res = await browser
    .newContext()
    .then((c) => c.request.delete(`${new URL(maria.page.url()).origin}/api/me/avatar`));
  expect(res.status()).not.toBe(200);

  await maria.ctx.close();
  await allan.ctx.close();
});
