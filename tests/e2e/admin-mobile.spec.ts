import { expect, test } from "@playwright/test";
import { E2E } from "./env";

test("navegação do painel no celular usa pílulas e não rola para o lado", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "só no celular");
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(E2E.adminEmail);
  await page.getByLabel("Senha").fill(E2E.adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const top = page.locator(".nl-admin-top");
  await expect(top).toBeVisible();
  await expect(page.locator(".nl-admin-side")).toBeHidden();
  for (const [link, heading] of [
    ["Usuários", "Usuários"],
    ["Mídias", "Mídias"],
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
