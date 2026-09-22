import { expect, test } from "@playwright/test";

test.describe("saved routes", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
    });

    await page.goto("/saved");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Log in/i })).toBeVisible();
  });
});
