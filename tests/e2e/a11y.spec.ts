import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E, participantFor } from "./env";

// Acessibilidade automática nas telas principais (ARQUITETURA §11): sem violações sérias ou críticas.
// Roda no desktop (1440) e no celular; a revisão em 834 px fica em ui.spec.

let ipN = 0;
async function ip(context: BrowserContext, project: string) {
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.80.${project === "mobile" ? 2 : 1}.${++ipN}`,
  });
}

async function audit(page: Page, label: string) {
  // espera as animações de entrada terminarem para medir o contraste das cores finais
  await page.waitForTimeout(450);
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map(
    (v) =>
      `${label} · ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
  );
  expect(report, report.join("\n")).toEqual([]);
}

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(E2E.adminEmail);
  await page.getByLabel("Senha").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("telas públicas e de entrada", async ({ page, context }, info) => {
  await ip(context, info.project.name);
  await page.goto("/");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await audit(page, "início");

  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Entrar no NuvemLeads" })).toBeVisible();
  await audit(page, "login do admin");
  await page.getByLabel("E-mail").fill("x@e2e.test");
  await page.getByLabel("Senha").fill("senha-errada-000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator(".nl-banner-error")).toBeVisible();
  await audit(page, "login do admin com erro");

  await page.goto("/admin/esqueci-senha");
  await audit(page, "esqueci a senha");

  const p = participantFor(info.project.name);
  await page.goto(`/u/${p.slug}`);
  await expect(page.getByLabel("PIN de 6 dígitos")).toBeVisible();
  await audit(page, "PIN");
  await page.getByLabel("PIN de 6 dígitos").fill("000001");
  await expect(page.getByText("PIN incorreto. Tente novamente.")).toBeVisible();
  await audit(page, "PIN incorreto");
});

test("painel do admin", async ({ page, context }, info) => {
  await ip(context, info.project.name);
  await adminLogin(page);
  await audit(page, "painel");
  await page.goto("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
  await audit(page, "usuários");
  const row = page.locator(".nl-user-row", { hasText: "Maria Clara" });
  // só abre a confirmação e fecha com Esc (Maria continua ativa para os outros testes)
  await row.getByRole("button", { name: "Desativar" }).click();
  const confirm = page.getByRole("dialog", { name: "Desativar Maria?" });
  await expect(confirm).toBeVisible();
  await audit(page, "confirmação de desativar");
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(row.getByRole("button", { name: "Desativar" })).toBeFocused();

  await row.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar usuário" })).toBeVisible();
  await audit(page, "editar usuário");
  await page.goto("/admin/usuarios/novo");
  await audit(page, "novo usuário");
  await page.goto("/admin/configuracoes");
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
  await audit(page, "configurações");
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page.getByRole("dialog", { name: "Alterar senha" })).toBeVisible();
  await audit(page, "alterar senha");
  await page.keyboard.press("Escape");
});

test("conversa, anexos e bloqueio", async ({ page, context }, info) => {
  await ip(context, info.project.name);
  const p = participantFor(info.project.name);
  await page.goto(`/u/${p.slug}`);
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  await page.getByLabel("Mensagem").fill("Teste de acessibilidade");
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".nl-msg", { hasText: "Teste de acessibilidade" }).last(),
  ).toHaveAttribute("data-status", /sent|delivered|read/);
  await audit(page, "conversa");

  await page.getByRole("button", { name: "Anexar" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await audit(page, "menu de anexo");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Menu da sessão" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await audit(page, "menu da conversa");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Bloquear" }).click();
  await expect(page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  await audit(page, "bloqueio");
  await page.getByLabel("PIN de 6 dígitos").fill(p.pin);
  await expect(page.getByLabel("Mensagem")).toBeVisible();
});

test("só com o teclado: foco visível, ordem do campo e foco preso no modal", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "teclado físico");
  await ip(context, info.project.name);
  await adminLogin(page);
  await page.goto("/admin/configuracoes");
  await page.getByRole("button", { name: "Alterar senha" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Alterar senha" });
  await expect(dialog).toBeVisible();
  // o foco entra no modal e não sai dele com Tab
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Alterar senha" })).toBeFocused();

  const p = participantFor(info.project.name);
  await page.goto(`/u/${p.slug}`);
  // o campo do PIN recebe o foco sozinho; só então digita (a página precisa ter carregado)
  await expect(page.getByLabel("PIN de 6 dígitos")).toBeFocused();
  await page.keyboard.type(p.pin);
  const box = page.getByLabel("Mensagem");
  await expect(box).toBeVisible();
  await box.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Emojis" })).toBeFocused();
  // anel de foco visível em botão de ícone
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return s.outlineStyle !== "none" || s.boxShadow !== "none";
  });
  expect(ring).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Gravar áudio" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Anexar" })).toBeFocused();
});
