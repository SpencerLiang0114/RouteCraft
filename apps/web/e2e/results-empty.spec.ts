import { expect, test } from "@playwright/test";

test.describe("results empty state", () => {
  test("shows empty guidance when no route is selected", async ({ page }) => {
    await page.goto("/results");
    await expect(page.getByRole("heading", { name: /No route selected yet/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Choose route source/i })).toBeVisible();
  });
});
