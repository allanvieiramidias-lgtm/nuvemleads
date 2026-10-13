import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E, participantFor } from "./env";

// Em sequência dentro de cada projeto: as pessoas e os contadores são compartilhados.
test.describe.configure({ mode: "serial" });

// Cada teste usa um "IP" próprio (X-Forwarded-For), para os contadores de tentativas não se somarem.
test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.9.${info.workerIndex}.${(info.retry * 50 + info.parallelIndex + Math.floor(Math.random() * 200)) % 250}`,
  });
});

const pinField = (page: Page) => page.getByLabel("PIN de 6 dígitos");

async function enterPin(page: Page, pin: string) {
  await pinField(page).fill(pin);
}

async function clearUserLimits(userSlug: string) {
  const pool = new Pool({ connectionString: E2E.databaseUrl });
  await pool.query(
    "delete from rate_limits where key like '%' || (select id::text from users where slug = $1) || '%'",
    [userSlug],
  );
  await pool.end();
}

test("aviso de PIN alterado pelo admin aparece uma vez", async ({
  page,
  context,
  isMobile,
}, info) => {
  test.skip(!isMobile, "Allan (celular) tem o aviso");
  const p = participantFor(info.project.name);
  const pool = new Pool({ connectionString: E2E.databaseUrl });
  await pool.query("update users set pin_notice_seen = false where slug = $1", [p.slug]);
  await pool.end();
  await page.goto(`/u/${p.slug}`);
  await expect(page.getByText("Seu PIN foi alterado pelo administrador.")).toBeVisible();
  await loginOk(page, context, info.project.name);
  await context.clearCookies();
  await page.goto(`/u/${p.slug}`);
  await expect(page.getByRole("heading", { name: "Digite seu PIN" })).toBeVisible();
  await expect(page.getByText("Seu PIN foi alterado pelo administrador.")).toHaveCount(0);
});

test("tela inicial pede o link pessoal (sem lista pública de nomes)", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Abra o link pessoal que o administrador enviou para você."),
  ).toBeVisible();
  await expect(page.getByText("Maria Clara")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Acesso administrativo" })).toBeVisible();
});

test("/chat sem sessão volta para o início", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/$/);
});

test("link inválido mostra aviso", async ({ page }) => {
  await page.goto("/u/linkquenaoexiste");
  await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
  await expect(
    page.getByText("Este link não é válido. Peça um novo link ao administrador."),
  ).toBeVisible();
});

test("PIN errado: mensagem, tremor e campo limpo; 3 erros → espera com contagem", async ({
  page,
}, info) => {
  const p = participantFor(info.project.name);
  await clearUserLimits(p.slug);
  await page.goto(`/u/${p.slug}`);
  await expect(page.getByText(p.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Digite seu PIN" })).toBeVisible();
  await expect(pinField(page)).toBeFocused();
  await expect(page.getByRole("button", { name: "Desbloquear" })).toBeDisabled();

  await enterPin(page, "111111");
  await expect(page.getByText("PIN incorreto. Tente novamente.")).toBeVisible();
  await expect(page.locator(".nl-pin")).toHaveAttribute("data-state", "error");
  await expect(page.locator(".nl-pin")).toHaveAttribute("data-shake", /a|b/);
  await expect(pinField(page)).toHaveValue("");

  await enterPin(page, "222222");
  await expect(pinField(page)).toHaveValue("");
  await enterPin(page, "333333");
  await expect(
    page.getByText(/Muitas tentativas\. Aguarde alguns segundos\. \(1[0-5]s\)/),
  ).toBeVisible();
  await expect(pinField(page)).toBeDisabled();
  await expect(page.locator(".nl-pin")).toHaveAttribute("data-state", "blocked");
  await clearUserLimits(p.slug);
});

async function loginOk(page: Page, context: BrowserContext, projectName: string) {
  const p = participantFor(projectName);
  await clearUserLimits(p.slug);
  await page.goto(`/u/${p.slug}`);
  await enterPin(page, p.pin);
  await expect(page.getByText("PIN correto. Abrindo conversa…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Desbloqueado" })).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/);
  // a conversa abriu (o servidor já registrou este carregamento)
  await expect(page.getByLabel("Mensagem")).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "nl_user");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  return p;
}

test("PIN certo abre a conversa; recarregar pede o PIN de novo (DECISOES §7)", async ({
  page,
  context,
}, info) => {
  await loginOk(page, context, info.project.name);
  await page.reload();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("heading", { name: "Sessão bloqueada" })).toBeVisible();
  await expect(page.getByText("A página foi aberta novamente.")).toBeVisible();
});

test("o link lembrado leva direto ao PIN; 'Trocar' esquece; 'Encerrar sessão' sai", async ({
  page,
  context,
}, info) => {
  const p = await loginOk(page, context, info.project.name);
  await page.getByRole("button", { name: "Menu da sessão" }).click();
  await page.getByRole("menuitem", { name: "Encerrar sessão" }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${p.slug}$`)); // "/" lembra o link
  await page.getByRole("button", { name: "Não é você? Trocar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("Abra o link pessoal que o administrador enviou para você."),
  ).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
});

test("PIN fica escondido e só aceita números", async ({ page }, info) => {
  const p = participantFor(info.project.name);
  await page.goto(`/u/${p.slug}`);
  await expect(pinField(page)).toHaveAttribute("type", "password");
  await expect(pinField(page)).toHaveAttribute("inputmode", "numeric");
  await expect(pinField(page)).toHaveAttribute("autocomplete", "one-time-code");
  await pinField(page).pressSequentially("1a2b");
  await expect(pinField(page)).toHaveValue("12");
});
