import { test, expect } from "@playwright/test";

/**
 * Staff join smoke: public join page renders with token validation error when token missing.
 * Full invite flow requires seeded staff + mail — run in CI with fixtures when available.
 */
test.describe("Provider staff join", () => {
  test("join page shows missing token message", async ({ page }) => {
    await page.goto("/provider/join");
    await expect(page.getByText(/invite token|Missing invite/i)).toBeVisible({ timeout: 15_000 });
  });

  test("join page loads with invalid token", async ({ page }) => {
    await page.goto("/provider/join?token=00000000-0000-0000-0000-000000000001");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  });
});
