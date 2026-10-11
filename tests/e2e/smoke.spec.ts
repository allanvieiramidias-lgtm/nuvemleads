import { expect, test } from "@playwright/test";

test("página inicial abre com o tema Nocturne", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("NuvemLeads");
  // Garante que a ordem dos tokens não quebrou o tema (DECISOES §2)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(22, 24, 38)");
});
