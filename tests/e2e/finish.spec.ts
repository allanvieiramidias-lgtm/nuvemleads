import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E, participantFor } from "./env";

// Acabamento (Etapa 9): teclado do celular, tablet em 834 px, ícones e manifest.

let ipN = 0;
async function enter(context: BrowserContext, page: Page, project: string) {
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.90.${project === "mobile" ? 2 : 1}.${++ipN}`,
  });
  const p = participantFor(project);
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  return p;
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("teclado aberto: campo e última mensagem continuam visíveis", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile", "só no celular");
  await enter(context, page, info.project.name);
  const box = page.getByLabel("Mensagem");
  for (let i = 1; i <= 14; i++) {
    await box.fill(`Linha ${i} para encher a conversa`);
    await page.keyboard.press("Enter");
  }
  const last = page.locator(".nl-msg", { hasText: "Linha 14 para encher a conversa" }).last();
  await expect(last).toBeInViewport();

  // o teclado "abre": a área visível encolhe ~45%
  const full = page.viewportSize()!;
  await box.focus();
  await page.setViewportSize({ width: full.width, height: Math.round(full.height * 0.55) });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--nl-vvh")))
    .toBe(`${Math.round(full.height * 0.55)}px`);
  await expect(box).toBeInViewport();
  await expect(last).toBeInViewport();
  const composerBottom = await page
    .locator(".nl-composer")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  expect(composerBottom).toBeLessThanOrEqual(Math.round(full.height * 0.55) + 1);

  // fecha o teclado
  await page.setViewportSize(full);
  await expect(last).toBeInViewport();
  await expect(box).toBeInViewport();
});

test("tablet (834 px): conversa e painel ocupam a largura sem rolar para o lado", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "tamanho de tablet simulado no desktop");
  await page.setViewportSize({ width: 834, height: 1112 });
  await enter(context, page, "desktop");
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  const w = await page.locator(".nl-composer").evaluate((el) => el.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(780); // largura total, não a coluna de 780 px do desktop

  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(E2E.adminEmail);
  await page.getByLabel("Senha").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const path of ["/admin", "/admin/usuarios", "/admin/configuracoes"]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    expect(await noSideScroll(page), path).toBeLessThanOrEqual(0);
  }
});

test("ícones, manifest e título fixo", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("NuvemLeads");
  const links = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute("rel")} ${e.getAttribute("href")}`));
  expect(links.some((l) => l.startsWith("icon /icon.svg"))).toBe(true);
  expect(links.some((l) => l.startsWith("apple-touch-icon /apple-icon.png"))).toBe(true);
  expect(links.some((l) => l.startsWith("manifest /manifest.webmanifest"))).toBe(true);

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("NuvemLeads");
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toContain(icon.type);
  }
  expect((await request.get("/apple-icon.png")).status()).toBe(200);
});
