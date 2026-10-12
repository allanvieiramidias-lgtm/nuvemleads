import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";

async function login(page: Page, email: string, password = E2E.adminPassword) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const toast = (page: Page) => page.locator(".nl-toast");

// O fluxo cria e altera usuários no banco compartilhado: roda só no projeto desktop.
test.describe("fluxo completo do admin (ARQUITETURA §11)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "fluxo que altera dados roda só no desktop");

  test("painel → criar (validações) → criado → lista → editar → PIN → configurações", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page, "painel@e2e.test");

    // Painel vazio
    await expect(page.getByRole("heading", { name: "Olá, Paula" })).toBeVisible();
    await expect(page.getByText("0 de 2 vagas ativas")).toBeVisible();
    await expect(page.getByText("Nenhuma atividade ainda.")).toBeVisible();

    // Usuários → Novo
    await page.getByRole("link", { name: "Usuários" }).first().click();
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await page.getByRole("link", { name: "Novo usuário" }).click();
    await expect(page.getByRole("heading", { name: "Novo usuário" })).toBeVisible();

    // Validações do README §4.9
    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.getByText("Informe o nome da pessoa.")).toBeVisible();
    await expect(page.getByText("O PIN deve ter exatamente 6 números.")).toBeVisible();
    await page.getByLabel("Nome").fill("Maria Clara");
    await expect(page.getByText("Informe o nome da pessoa.")).toBeHidden(); // some ao editar
    await page.getByLabel("PIN (6 dígitos)").fill("123456");
    await page.getByLabel("Confirmar PIN").fill("123456");
    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.getByText("Escolha um PIN menos previsível.")).toBeVisible();
    await page.getByLabel("PIN (6 dígitos)").fill("905317");
    await page.getByLabel("Confirmar PIN").fill("905318");
    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.getByText("Os PINs não coincidem.")).toBeVisible();
    await page.getByLabel("Confirmar PIN").fill("905317");
    // PIN nunca em texto aberto
    await expect(page.getByLabel("PIN (6 dígitos)")).toHaveAttribute("type", "password");

    // Foto
    await page.locator('input[type="file"]').setInputFiles("scripts/demo/photo.jpg");
    await expect(page.getByRole("button", { name: "Remover" })).toBeVisible();

    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.getByRole("heading", { name: "Usuário criado" })).toBeVisible();
    await expect(
      page.getByText("Maria já pode acessar a conversa com o PIN definido."),
    ).toBeVisible();
    const link = await page.locator(".nl-link-box code").innerText();
    expect(link).toMatch(new RegExp(`^http://localhost:${E2E.port}/u/[a-z0-9]{12}$`));
    await page.getByRole("button", { name: "Copiar link" }).click();
    await expect(toast(page)).toHaveText("Link copiado.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    // Segunda pessoa
    await page.getByRole("button", { name: "Criar outro" }).click();
    await page.getByLabel("Nome").fill("Allan Souza");
    await page.getByLabel("PIN (6 dígitos)").fill("246810");
    await page.getByLabel("Confirmar PIN").fill("246810");
    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.getByRole("heading", { name: "Usuário criado" })).toBeVisible();

    // Terceira: com 2 ativos o padrão vem Inativo; forçar Ativo dá erro
    await page.getByRole("button", { name: "Criar outro" }).click();
    await expect(page.getByRole("radio", { name: "Inativo" })).toBeChecked();
    await page.getByLabel("Nome").fill("João Lima");
    await page.getByLabel("PIN (6 dígitos)").fill("481526");
    await page.getByLabel("Confirmar PIN").fill("481526");
    await page.getByText("Ativo", { exact: true }).click();
    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(
      page.getByText("A sala já tem duas pessoas ativas. Desative alguém ou salve como Inativo."),
    ).toBeVisible();
    await page.getByText("Inativo", { exact: true }).click();
    await page.getByRole("button", { name: "Criar usuário" }).click();
    await expect(
      page.getByText("João foi criado(a) como Inativo. Ative quando houver uma vaga na sala."),
    ).toBeVisible();

    // Lista com destaque e medidor
    await page.getByRole("link", { name: "Ver usuários" }).click();
    await expect(page.getByText("2 de 2 vagas ativas")).toBeVisible();
    await expect(page.locator(".nl-user-row[data-highlight]")).toContainText("João Lima");
    const rowOf = (name: string) => page.locator(".nl-user-row", { hasText: name });
    await expect(rowOf("Maria Clara").locator("img")).toBeVisible(); // foto salva

    // Ativar um terceiro com a sala cheia
    await rowOf("João Lima").getByRole("button", { name: "Ativar" }).click();
    await expect(toast(page)).toHaveText("A sala já tem duas pessoas ativas.");

    // Desativar com confirmação
    await rowOf("Maria Clara").getByRole("button", { name: "Desativar" }).click();
    const dialog = page.getByRole("dialog", { name: "Desativar Maria?" });
    await expect(dialog).toContainText(
      "Essa pessoa perde o acesso à conversa até ser reativada. As mensagens são mantidas.",
    );
    await dialog.getByRole("button", { name: "Desativar" }).click();
    await expect(toast(page)).toHaveText("Maria foi desativado(a).");
    await expect(page.getByText("1 de 2 vagas ativas")).toBeVisible();
    await expect(rowOf("Maria Clara")).toContainText("Inativo");

    // Agora dá para ativar João
    await rowOf("João Lima").getByRole("button", { name: "Ativar" }).click();
    await expect(toast(page)).toHaveText("João foi reativado(a).");
    await expect(page.getByText("2 de 2 vagas ativas")).toBeVisible();

    // Editar João: trocar PIN com confirmação
    await rowOf("João Lima").getByRole("link", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: "Editar usuário" })).toBeVisible();
    await expect(page.getByLabel("PIN definido (oculto)")).toHaveText("••••••");
    const oldLink = await page.locator(".nl-link-box code").innerText();
    await page.getByRole("button", { name: "Alterar PIN" }).click();
    await page.getByRole("button", { name: "Manter PIN atual" }).click();
    await expect(page.getByLabel("PIN definido (oculto)")).toBeVisible();
    await page.getByRole("button", { name: "Alterar PIN" }).click();
    await page.getByLabel("Novo PIN (6 dígitos)").fill("739201");
    await page.getByLabel("Confirmar PIN").fill("739201");
    await page.getByLabel("Nome").fill("João Lima Neto");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    const pinDialog = page.getByRole("dialog", { name: "Alterar o PIN de João?" });
    await expect(pinDialog).toContainText(
      "O PIN atual deixa de funcionar imediatamente. João precisará do novo PIN no próximo desbloqueio.",
    );
    await pinDialog.getByRole("button", { name: "Alterar PIN" }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios\?destaque=/);
    await expect(toast(page)).toHaveText("PIN alterado e alterações salvas.");
    await expect(rowOf("João Lima Neto")).toBeVisible();

    // Gerar novo link invalida o anterior
    await rowOf("João Lima Neto").getByRole("link", { name: "Editar" }).click();
    await page.getByRole("button", { name: "Gerar novo link" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Gerar novo link" }).click();
    await expect(toast(page)).toHaveText("Novo link gerado. O anterior deixou de funcionar.");
    await expect(page.locator(".nl-link-box code")).not.toHaveText(oldLink);

    // Configurações
    await page.getByRole("link", { name: "Configurações" }).first().click();
    const group = page.getByRole("radiogroup", { name: "Tempo para bloqueio automático" });
    await expect(group.getByRole("radio", { name: "5 min", exact: true })).toBeChecked();
    await group.getByText("15 min").click();
    const tabSwitch = page.getByRole("switch", { name: "Exigir PIN ao retornar à aba" });
    await expect(tabSwitch).toHaveAttribute("aria-checked", "true");
    await tabSwitch.click();
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(toast(page)).toHaveText("Configurações salvas.");
    await page.reload();
    await expect(group.getByRole("radio", { name: "15 min" })).toBeChecked();
    await expect(tabSwitch).toHaveAttribute("aria-checked", "false");

    // Alterar senha
    await page.getByRole("button", { name: "Alterar senha" }).click();
    const pw = page.getByRole("dialog", { name: "Alterar senha" });
    await pw.getByLabel("Senha atual").fill("errada-0000");
    await pw.getByLabel("Nova senha", { exact: true }).fill("senha-nova-do-painel");
    await pw.getByLabel("Confirmar nova senha").fill("senha-nova-do-painel");
    await pw.getByRole("button", { name: "Salvar senha" }).click();
    await expect(pw.getByText("A senha atual não confere.")).toBeVisible();
    await pw.getByLabel("Senha atual").fill(E2E.adminPassword);
    await pw.getByRole("button", { name: "Salvar senha" }).click();
    await expect(toast(page)).toHaveText("Senha alterada.");
    await expect(page.getByText("Alterada hoje")).toBeVisible();

    // Painel reflete os usuários (sem mensagens ainda)
    await page.getByRole("link", { name: "Painel" }).first().click();
    await expect(page.getByText("2 de 2 vagas ativas")).toBeVisible();
  });
});

test("API do admin exige sessão", async ({ request }) => {
  const res = await request.get("/api/admin/users");
  expect(res.status()).toBe(401);
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("navegação do painel no celular usa pílulas e não rola para o lado", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "só no celular");
  await login(page, E2E.adminEmail);
  const top = page.locator(".nl-admin-top");
  await expect(top).toBeVisible();
  await expect(page.locator(".nl-admin-side")).toBeHidden();
  for (const [link, heading] of [
    ["Usuários", "Usuários"],
    ["Configurações", "Configurações"],
    ["Painel", "Olá, Renata"],
  ]) {
    await top.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(top.getByRole("link", { name: link })).toHaveAttribute("aria-current", "page");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
