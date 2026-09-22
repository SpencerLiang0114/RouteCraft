import { expect, test } from "@playwright/test";

test.describe("smoke navigation", () => {
  test("home page loads with brand and primary CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("RouteCraft").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Plan smarter/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Create a Route/i })).toBeVisible();
  });

  test("route-source page lists creation options", async ({ page }) => {
    await page.goto("/route-source");
    await expect(
      page.getByRole("heading", { name: /How do you want to create your route/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Generate a new route/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Upload GPX or KML/i })).toBeVisible();
  });

  test("login page loads", async ({ page }) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Log in/i })).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
  });
});
