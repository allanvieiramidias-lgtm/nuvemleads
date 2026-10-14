import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { cookieName, E2E, participantFor, PARTICIPANTS } from "./env";

// DECISOES §29: usuário + PIN na página principal, aparelho lembrado por 180 dias e
// "Você tem novas mensagens" sem revelar nada. Fase própria (projeto "notice"): o aviso
// depende de mensagens não lidas, então nada mais pode mexer na conversa ao mesmo tempo.
test.describe.configure({ mode: "serial" });

const maria = () => participantFor("desktop");
const allan = () => ({ ...PARTICIPANTS[1], slug: participantFor("mobile").slug });
const notice = (page: Page) => page.getByText("Você tem novas mensagens");

let ipN = 0;
async function newContext(browser: Browser) {
  return browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "x-forwarded-for": `10.97.0.${++ipN}` },
  });
}

async function loginByUsername(page: Page, username: string, pin: string) {
  await page.goto("/");
  await page.getByLabel("Usuário").fill(username);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("PIN de 6 dígitos").fill(pin);
}

/** Allan manda uma mensagem pelo link dele, em outro navegador. */
async function allanSends(browser: Browser, text: string) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const a = allan();
  await page.goto(`/u/${a.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(a.pin);
  await page.getByLabel("Mensagem").fill(text);
  await page.keyboard.press("Enter");
  await expect(page.locator(".nl-msg", { hasText: text }).last()).toHaveAttribute(
    "data-status",
    /sent|delivered|read/,
  );
  await ctx.close();
}

async function deviceCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === cookieName("nl_device"));
}

test("usuário + PIN pela página principal; usuário que não existe = PIN incorreto", async ({
  browser,
}) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const m = maria();

  await loginByUsername(page, "fantasma", m.pin);
  await expect(page.getByText("PIN incorreto. Tente novamente.")).toBeVisible();
  await expect(page.getByText("Maria")).toHaveCount(0); // não revela quem existe

  await page.getByRole("button", { name: "Trocar usuário" }).click();
  await page.getByLabel("Usuário").fill("  MARIA ");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("PIN de 6 dígitos").fill(m.pin);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByLabel("Mensagem")).toBeVisible();

  // aparelho lembrado por 180 dias, inacessível ao JavaScript
  const c = await deviceCookie(ctx);
  expect(c?.httpOnly).toBe(true);
  expect(c?.sameSite).toBe("Strict");
  const days = ((c?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(179);
  expect(days).toBeLessThanOrEqual(180.01);
  await ctx.close();
});

test("aparelho lembrado abre direto no PIN e avisa novas mensagens; só o link não avisa", async ({
  browser,
}) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const m = maria();
  await loginByUsername(page, "maria", m.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();

  // sai da sessão: o aparelho continua lembrando e "/" leva ao PIN da Maria
  await page.getByRole("button", { name: "Menu da sessão" }).click();
  await page.getByRole("menuitem", { name: "Encerrar sessão" }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${m.slug}$`));
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/u/${m.slug}$`));
  await expect(page.getByText("Maria Clara")).toBeVisible();

  await allanSends(browser, "Mensagem para o aviso 1");
  await page.reload();
  await expect(notice(page)).toBeVisible();
  // nada além do sim/não: nem quem mandou, nem o texto
  expect(await page.content()).not.toContain("Mensagem para o aviso 1");
  await expect(page.getByText("Allan")).toHaveCount(0);

  // quem só tem o link, em outro navegador, não vê o aviso
  const other = await newContext(browser);
  const op = await other.newPage();
  await op.goto(`/u/${m.slug}`);
  await expect(op.getByRole("heading", { name: "Digite seu PIN" })).toBeVisible();
  await op.waitForTimeout(800);
  await expect(notice(op)).toHaveCount(0);
  expect((await op.request.get("/api/notice")).status()).toBe(401);
  await other.close();

  // entra, lê, bloqueia: sem aviso; nova mensagem: o aviso aparece na tela de bloqueio
  const read = page.waitForResponse((r) => r.url().endsWith("/api/messages/read") && r.ok());
  await page.getByLabel("PIN de 6 dígitos").fill(m.pin);
  await expect(page.locator(".nl-msg", { hasText: "Mensagem para o aviso 1" })).toBeVisible();
  await read; // a conversa marca como lida logo depois de mostrar
  await page.getByRole("button", { name: "Bloquear" }).click();
  await expect(page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);

  await allanSends(browser, "Mensagem para o aviso 2");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(notice(page)).toBeVisible();
  expect(await page.content()).not.toContain("Mensagem para o aviso 2");
  await ctx.close();
});

test("desligado no painel, não avisa; 'Não é você? Trocar' esquece o aparelho", async ({
  browser,
}) => {
  const m = maria();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await loginByUsername(page, "maria", m.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  await page.getByRole("button", { name: "Menu da sessão" }).click();
  await page.getByRole("menuitem", { name: "Encerrar sessão" }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${m.slug}$`));
  await allanSends(browser, "Mensagem para o aviso 3");
  await page.reload();
  await expect(notice(page)).toBeVisible();

  const admin = await newContext(browser);
  const ap = await admin.newPage();
  const toggle = async (on: boolean) => {
    await ap.goto("/admin/configuracoes");
    const sw = ap.getByRole("switch", { name: "Avisar novas mensagens na tela de PIN" });
    if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
    await ap.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(ap.getByText("Configurações salvas.")).toBeVisible();
  };
  await ap.goto("/admin/login");
  await ap.getByLabel("E-mail").fill(E2E.adminEmail);
  await ap.getByLabel("Senha").fill(E2E.adminPassword);
  await ap.getByRole("button", { name: "Entrar" }).click();
  await expect(ap).toHaveURL(/\/admin$/);
  await toggle(false);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Digite seu PIN" })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(notice(page)).toHaveCount(0);
  await toggle(true);
  await page.reload();
  await expect(notice(page)).toBeVisible();
  await admin.close();

  await page.getByRole("button", { name: "Não é você? Trocar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Usuário")).toBeVisible();
  expect(await deviceCookie(ctx)).toBeUndefined();
  await page.goto("/");
  await expect(page.getByLabel("Usuário")).toBeVisible();
  await ctx.close();
});
