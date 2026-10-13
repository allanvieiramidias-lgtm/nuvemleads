import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E, participantFor, PROD } from "./env";

// Segurança HTTP (Etapa 10, DECISOES §14): CSP com nonce em toda página, nada legítimo bloqueado,
// rota de saúde sem dados. Com E2E_PROD=1 roda contra o build de produção.

/** Registra no navegador toda violação de CSP (o evento é disparado no documento). */
async function watchCsp(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
}
const violations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

let ipN = 0;
const ip = (context: BrowserContext) =>
  context.setExtraHTTPHeaders({ "x-forwarded-for": `10.95.0.${++ipN}` });

test.skip(({ isMobile }) => isMobile, "cabeçalhos não mudam com o aparelho");

test("toda página tem CSP com nonce próprio e os scripts carregam com ele", async ({ request }) => {
  const nonces = new Set<string>();
  for (const path of [
    "/",
    "/admin/login",
    "/admin/esqueci-senha",
    `/u/${participantFor("desktop").slug}`,
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const csp = res.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, path).toBeTruthy();
    nonces.add(nonce!);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    if (PROD) expect(csp).not.toContain("unsafe-eval");
    // todo <script> da página leva o nonce desta resposta
    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const s of scripts) expect(s, path).toContain(`nonce="${nonce}"`);
  }
  expect(nonces.size).toBe(4); // um nonce diferente por resposta
});

test("navegar pelo painel, PIN, conversa e anexos sem nenhuma violação de CSP", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await watchCsp(ctx);
  await ip(ctx);
  const page = await ctx.newPage();

  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(E2E.adminEmail);
  await page.getByLabel("Senha").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const link of ["Usuários", "Configurações", "Painel"]) {
    await page.locator(".nl-admin-side").getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading").first()).toBeVisible();
  }
  expect(await violations(page)).toEqual([]);

  const p = participantFor("desktop");
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  // tempo real (WebSocket) conectado: o status do contato aparece
  await expect(page.locator(".nl-chat-status")).not.toBeEmpty();

  // prévia local (blob:) e envio de foto
  await page.getByRole("button", { name: "Anexar" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /Foto ou vídeo/ }).click();
  await (await chooser).setFiles("scripts/demo/photo.jpg");
  const dialog = page.getByRole("dialog", { name: "Enviar imagem" });
  await expect(dialog.getByAltText("Prévia da imagem")).toBeVisible();
  await dialog.getByLabel("Legenda").fill("Teste de CSP");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  const bubble = page.locator(".nl-msg", { hasText: "Teste de CSP" }).last();
  await expect(bubble).toHaveAttribute("data-status", /sent|delivered|read/);
  await bubble.getByRole("button", { name: /Abrir imagem/ }).click();
  const viewer = page.getByRole("dialog", { name: "photo.jpg" });
  await expect(viewer.locator("img")).toBeVisible();
  await page.keyboard.press("Escape");

  // emojis e menu
  await page.getByRole("button", { name: "Emojis" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Bloquear" }).click();
  await expect(page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();

  expect(await violations(page)).toEqual([]);

  // prova de que a CSP vale: código embutido num HTML injetado (o XSS típico) não roda
  const ran = await page.evaluate(async () => {
    const w = window as unknown as { __injected?: boolean };
    const div = document.createElement("div");
    div.innerHTML = '<img src="data:," onerror="window.__injected = true">';
    document.body.append(div);
    await new Promise((r) => setTimeout(r, 200));
    div.remove();
    return w.__injected === true;
  });
  expect(ran).toBe(false);
  expect((await violations(page)).some((v) => v.startsWith("script-src"))).toBe(true);
  await ctx.close();
});

test("rota de saúde responde 200 sem dados e sem cache", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
