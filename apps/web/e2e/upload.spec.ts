import { expect, test } from "@playwright/test";

test.describe("upload page", () => {
  test("rejects invalid file messaging", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /Upload GPX or KML/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a route"),
    });

    await expect(page.getByText(/Only \.gpx and \.kml files are supported/i)).toBeVisible();
  });

  test("rejects oversized file messaging", async ({ page }) => {
    await page.goto("/upload");

    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
    await page.locator('input[type="file"]').setInputFiles({
      name: "too-big.gpx",
      mimeType: "application/gpx+xml",
      buffer: oversized,
    });

    await expect(page.getByText(/too large/i)).toBeVisible();
  });

  test("rejects invalid GPX content", async ({ page }) => {
    await page.goto("/upload");

    await page.locator('input[type="file"]').setInputFiles({
      name: "broken.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from("<gpx><trk>"),
    });

    await expect(page.getByText(/Invalid GPX/i)).toBeVisible();
  });
});
