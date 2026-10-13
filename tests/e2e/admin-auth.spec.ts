import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cookieName, E2E, PROD } from "./env";

const GENERIC = "Não foi possível entrar. Verifique seus dados.";

async function fillLogin(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("sem sessão, /admin leva ao login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar no NuvemLeads" })).toBeVisible();
});

test("login com erro mostra a mensagem genérica e marca os campos", async ({ page }, info) => {
  // e-mail único por projeto para não somar tentativas entre execuções paralelas
  await fillLogin(page, `ninguem-${info.project.name}@e2e.test`, "senha-errada-000");
  await expect(page.locator(".nl-banner-error")).toHaveText(GENERIC);
  await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Senha")).toHaveAttribute("aria-invalid", "true");
  // o erro some ao editar
  await page.getByLabel("Senha").fill("x");
  await expect(page.locator(".nl-banner-error")).toBeHidden();
});

test("login com sucesso, mostra 'Entrando…', abre o painel e sai", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(E2E.adminEmail);
  await page.getByLabel("Senha").fill(E2E.adminPassword);
  // segura a resposta para ver o estado de carregamento
  await page.route("**/api/admin/login", async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Entrando…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Olá, Renata" })).toBeVisible();

  // logado, o login redireciona de volta ao painel
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("cookie de sessão é HttpOnly e SameSite=Strict", async ({ page, context }) => {
  await fillLogin(page, E2E.adminEmail, E2E.adminPassword);
  await expect(page).toHaveURL(/\/admin$/);
  const cookie = (await context.cookies()).find((c) => c.name === cookieName("nl_admin"));
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
});

test("API recusa login sem Origin do próprio site (CSRF)", async ({ request }) => {
  const res = await request.post("/api/admin/login", {
    data: { email: E2E.adminEmail, password: E2E.adminPassword },
    headers: { Origin: "https://site-malicioso.example" },
  });
  expect(res.status()).toBe(401);
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("esqueci minha senha → e-mail → nova senha → login", async ({ page }, info) => {
  test.skip(PROD, "em produção o e-mail sai por SMTP (sem pasta de teste)");
  const email = `reset-${info.project.name}@e2e.test`;
  await page.goto("/admin/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/admin\/esqueci-senha$/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText(/Se este e-mail estiver cadastrado/)).toBeVisible();

  // lê o e-mail gravado na caixa de saída de testes
  let link: string | undefined;
  await expect
    .poll(async () => {
      const files = await readdir(E2E.outbox).catch(() => []);
      for (const f of files) {
        const mail = JSON.parse(await readFile(path.join(E2E.outbox, f), "utf8")) as {
          to: string;
          text: string;
        };
        if (mail.to === email) link = mail.text.match(/https?:\/\/\S+/)?.[0];
      }
      return link;
    })
    .toBeTruthy();

  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Criar nova senha" })).toBeVisible();
  await page.getByLabel("Nova senha").fill("curta");
  await page.getByLabel("Confirmar senha").fill("outra");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("A senha deve ter pelo menos 10 caracteres.")).toBeVisible();
  await expect(page.getByText("As senhas não coincidem.")).toBeVisible();

  await page.getByLabel("Nova senha").fill("nova-senha-segura-1");
  await page.getByLabel("Confirmar senha").fill("nova-senha-segura-1");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("Senha alterada. Entre com a nova senha.")).toBeVisible();

  // o mesmo link não vale de novo
  await page.goto(link!);
  await expect(page.locator(".nl-banner-error")).toHaveText("Este link expirou. Peça um novo.");

  await fillLogin(page, email, "nova-senha-segura-1");
  await expect(page).toHaveURL(/\/admin$/);
});

test("link de redefinição inválido mostra aviso", async ({ page }) => {
  await page.goto("/admin/redefinir-senha?token=token-inventado-123");
  await expect(page.locator(".nl-banner-error")).toHaveText("Este link expirou. Peça um novo.");
  await expect(page.getByRole("link", { name: "Esqueci minha senha" })).toBeVisible();
});
