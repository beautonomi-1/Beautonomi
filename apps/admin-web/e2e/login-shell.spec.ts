import { test, expect } from "@playwright/test";

test.describe("admin SPA static shell", () => {
  test("login route renders heading and sign-in form", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: /admin sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("protected route without API shows gate UX (login redirect or session error)", async ({ page }) => {
    await page.goto("/admin/dashboard");
    // Preview has no Next API: bootstrap may fail (network) → error+retry, or 401 path → /login.
    await expect(page.locator("body")).toContainText(
      /Verifying session|could not verify your admin session|Admin sign in/i,
      { timeout: 20_000 }
    );
  });

  test("control-plane route without API shows same session gate UX", async ({ page }) => {
    await page.goto("/admin/control-plane/overview");
    await expect(page.locator("body")).toContainText(
      /Verifying session|could not verify your admin session|Admin sign in/i,
      { timeout: 20_000 }
    );
  });
});
