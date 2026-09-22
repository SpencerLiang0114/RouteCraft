import { expect, test } from "@playwright/test";

test.describe("wizard UI", () => {
  test("loads first step controls without calling live routing", async ({ page }) => {
    await page.route("**/api/routing/generate", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "routing mocked offline" }),
      });
    });

    await page.goto("/wizard");
    await expect(page.getByRole("heading", { name: /Choose activity type/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Running/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hiking/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cycling/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Back/i })).toBeDisabled();
  });
});
