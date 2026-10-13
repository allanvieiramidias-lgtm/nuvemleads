import { expect, test } from "@playwright/test";
import { PROD } from "./env";

// Página de referência /dev/ui (Etapa 1). PIN de demonstração: 246810.
test.skip(PROD, "/dev/ui não existe em produção");
test.beforeEach(async ({ page }) => {
  await page.goto("/dev/ui");
});

test("página não tem rolagem horizontal", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("PIN: erro, espera após 3 erros e sucesso", async ({ page }) => {
  const pin = page.getByLabel("PIN de 6 dígitos");
  const row = page.locator(".nl-pin").first();

  await pin.fill("111111");
  await expect(row).toHaveAttribute("data-state", "error");
  await expect(page.getByText("PIN incorreto. Tente novamente.")).toBeVisible();
  // campo é limpo após o tremor
  await expect(pin).toHaveValue("");

  await pin.fill("222222");
  await expect(pin).toHaveValue("");
  await pin.fill("333333");
  await expect(
    page.getByText(/Muitas tentativas\. Aguarde alguns segundos\. \(1[45]s\)/),
  ).toBeVisible();
  await expect(row).toHaveAttribute("data-state", "blocked");
  await expect(pin).toBeDisabled();
});

test("PIN: sucesso e botão desabilitado até 6 dígitos", async ({ page }) => {
  const pin = page.getByLabel("PIN de 6 dígitos");
  const card = page.locator(".card", { has: page.getByText("PIN Input", { exact: true }) });
  const button = card.getByRole("button", { name: "Desbloquear", exact: true });
  await pin.fill("2468");
  await expect(button).toBeDisabled();
  await pin.fill("246810");
  await expect(page.getByText("PIN correto. Abrindo conversa…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Desbloqueado" })).toBeVisible();
  await expect(page.locator(".nl-pin").first()).toHaveAttribute("data-state", "success");
});

test("PIN: só aceita números, até 6", async ({ page }) => {
  const pin = page.getByLabel("PIN de 6 dígitos");
  await pin.pressSequentially("12ab3");
  await expect(pin).toHaveValue("123");
  await expect(pin).toHaveAttribute("type", "password");
});

test("toast aparece e some após 2,8 s", async ({ page }) => {
  await page.getByRole("button", { name: "Toast de sucesso" }).click();
  const toast = page.locator(".nl-toast");
  await expect(toast).toHaveText("Configurações salvas.");
  await expect(toast).toBeHidden({ timeout: 4000 });
});

test("modal: Esc fecha e devolve o foco", async ({ page }) => {
  const open = page.getByRole("button", { name: "Abrir modal" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Alterar o PIN de Maria?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

test("dropdown abre pelo teclado", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Abrir menu de sessão" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Bloquear agora" })).toBeVisible();
  await expect(page.getByText("Após 5 min sem atividade ou ao sair da aba")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
});

test("switch e segmented são acessíveis", async ({ page }) => {
  const sw = page.getByRole("switch", { name: "Exigir PIN ao reabrir sessão" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");

  const group = page.getByRole("radiogroup", { name: "Tempo para bloqueio automático" });
  await expect(group.getByRole("radio", { name: "5 min", exact: true })).toBeChecked();
  await group.getByText("15 min").click();
  await expect(group.getByRole("radio", { name: "15 min" })).toBeChecked();
});

test("botões só de ícone têm rótulo e tooltip", async ({ page, isMobile }) => {
  test.skip(isMobile, "tooltip é de mouse/teclado");
  const btn = page.getByRole("button", { name: "Bloquear agora" });
  await btn.focus();
  await expect(page.getByRole("tooltip", { name: "Bloquear agora" })).toBeVisible();
});

test("movimento reduzido desliga as animações", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const duration = await page
    .locator(".nl-presence[data-online]")
    .first()
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(duration).toBe("0.001s");
});
