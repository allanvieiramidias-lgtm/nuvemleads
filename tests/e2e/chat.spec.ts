import { expect, test, type Browser, type Page } from "@playwright/test";
import { participantFor, PARTICIPANTS } from "./env";

// Duas pessoas conversando em dois navegadores (README §11 da ARQUITETURA). Só no desktop:
// a conversa é compartilhada e os testes do celular não podem ver estas mensagens mudando.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "conversa entre dois navegadores roda só no desktop");

async function open(browser: Browser, who: "maria" | "allan", ip: string) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await ctx.newPage();
  const p =
    who === "maria"
      ? participantFor("desktop")
      : { ...PARTICIPANTS[1], slug: participantFor("mobile").slug };
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  return { ctx, page };
}

const bubble = (page: Page, text: string) => page.locator(".nl-msg", { hasText: text });
const status = (page: Page) => page.locator(".nl-chat-status");

test("Maria e Allan conversam em tempo real: entregue, lida, digitando, presença", async ({
  browser,
}) => {
  const maria = await open(browser, "maria", "10.50.0.1");
  await expect(maria.page.getByText("Nenhuma mensagem ainda")).toBeVisible();
  await expect(
    maria.page.getByText("Tudo o que for enviado aqui fica visível apenas para Maria e Allan."),
  ).toBeVisible();

  const allan = await open(browser, "allan", "10.50.0.2");
  await expect(status(maria.page)).toHaveText("Online");
  await expect(status(allan.page)).toHaveText("Online");
  await expect(maria.page.locator(".nl-chat-name")).toHaveText("Allan Souza");

  // digitando…
  await maria.page.getByLabel("Mensagem").pressSequentially("Oi, Al", { delay: 30 });
  await expect(status(allan.page)).toHaveText("digitando…");
  await expect(allan.page.getByRole("status", { name: "Maria está digitando" })).toBeVisible();
  // botão muda de microfone para enviar
  await expect(maria.page.getByRole("button", { name: "Enviar" })).toBeVisible();
  await maria.page.getByLabel("Mensagem").pressSequentially("lan");
  await maria.page.keyboard.press("Enter");

  // chega do outro lado; para de "digitar"; fica lida porque Allan está com a conversa aberta
  await expect(bubble(allan.page, "Oi, Allan")).toBeVisible();
  await expect(status(allan.page)).toHaveText("Online");
  await expect(bubble(maria.page, "Oi, Allan")).toHaveAttribute("data-status", "read");
  await expect(maria.page.getByLabel("Mensagem")).toHaveValue("");
  await expect(maria.page.getByRole("button", { name: "Gravar áudio" })).toBeVisible();

  // Shift+Enter quebra linha
  await allan.page.getByLabel("Mensagem").fill("Primeira linha");
  await allan.page.keyboard.press("Shift+Enter");
  await allan.page.keyboard.type("Segunda linha");
  await allan.page.keyboard.press("Enter");
  await expect(bubble(maria.page, "Primeira linha").locator(".nl-text")).toHaveText(
    "Primeira linha\nSegunda linha",
  );

  // emoji
  await maria.page.getByRole("button", { name: "Emojis" }).click();
  await maria.page.getByRole("button", { name: "Inserir cone de festa" }).first().click();
  await expect(maria.page.getByLabel("Mensagem")).toHaveValue("🎉");
  await maria.page.keyboard.press("Enter");
  await expect(bubble(allan.page, "🎉")).toBeVisible();

  // presença: Allan fecha → "Visto por último hoje às …"
  await allan.ctx.close();
  await expect(status(maria.page)).toHaveText(/^Visto por último hoje às \d\d:\d\d$/);
  await maria.ctx.close();
});

test("sem conexão: faixa offline, mensagem fica 'enviando' e sai ao reconectar", async ({
  browser,
}) => {
  const maria = await open(browser, "maria", "10.50.0.3");
  const allan = await open(browser, "allan", "10.50.0.4");

  await maria.ctx.setOffline(true);
  await expect(
    maria.page.getByText("Sem conexão. As mensagens serão enviadas quando a conexão voltar."),
  ).toBeVisible();
  await maria.page.getByLabel("Mensagem").fill("Mensagem da fila offline");
  await maria.page.keyboard.press("Enter");
  await expect(bubble(maria.page, "Mensagem da fila offline")).toHaveAttribute(
    "data-status",
    "sending",
  );

  await maria.ctx.setOffline(false);
  await expect(maria.page.getByText("Sem conexão.")).toBeHidden();
  await expect(bubble(allan.page, "Mensagem da fila offline")).toBeVisible();
  await expect(bubble(maria.page, "Mensagem da fila offline")).toHaveAttribute(
    "data-status",
    /delivered|read/,
  );
  // reenviar não duplicou
  await expect(bubble(allan.page, "Mensagem da fila offline")).toHaveCount(1);

  await maria.ctx.close();
  await allan.ctx.close();
});

test("servidor recusa: 'Não foi possível enviar.' e 'Tentar novamente'", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.50.0.5");
  let fail = true;
  await maria.page.route("**/api/messages", (route) =>
    route.request().method() === "POST" && fail
      ? route.fulfill({ status: 500, body: "{}" })
      : route.continue(),
  );
  await maria.page.getByLabel("Mensagem").fill("Vai falhar primeiro");
  await maria.page.keyboard.press("Enter");
  const b = bubble(maria.page, "Vai falhar primeiro");
  await expect(b).toHaveAttribute("data-status", "failed");
  await expect(b.getByText("Não foi possível enviar.")).toBeVisible();
  fail = false;
  await b.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(b).toHaveAttribute("data-status", /sent|delivered|read/);
  await expect(b.getByText("Não foi possível enviar.")).toBeHidden();
  await maria.ctx.close();
});

test("histórico ao reabrir e 'Bloquear' tira o acesso às mensagens (423)", async ({ browser }) => {
  const maria = await open(browser, "maria", "10.50.0.6");
  // mensagens dos testes anteriores continuam lá, com divisor de data
  await expect(bubble(maria.page, "Oi, Allan")).toBeVisible();
  await expect(maria.page.locator(".nl-day").first()).toHaveText(/Hoje/i);
  await expect(maria.page.locator(".nl-seal")).toHaveText("Conversa privada entre Maria e Allan");

  await maria.page.getByRole("button", { name: "Bloquear" }).click();
  await expect(maria.page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  // o aviso de bloqueio vai ao servidor em segundo plano (sendBeacon): espera ele chegar
  await expect.poll(async () => (await maria.page.request.get("/api/messages")).status()).toBe(423);
  await maria.ctx.close();
});
