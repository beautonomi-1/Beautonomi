import { test, expect } from "@playwright/test";

/**
 * Provider booking mobile shell smoke test (Phase 5 — default-on).
 *
 * Gate: requires provider auth storage state or E2E_PROVIDER_EMAIL/PASSWORD.
 */
test.describe("provider booking mobile shell", () => {
  test.beforeEach(({ }, testInfo) => {
    if (!process.env.E2E_PROVIDER_EMAIL && !process.env.PLAYWRIGHT_PROVIDER_STORAGE) {
      if (process.env.E2E_NON_SKIPPABLE === "true") {
        throw new Error("Provider E2E credentials missing but E2E_NON_SKIPPABLE=true");
      }
      testInfo.skip(true, "Provider credentials not configured — skipping provider booking E2E.");
    }
    test.skip(
      process.env.NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL === "0",
      "Mobile shell explicitly disabled via NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL=0",
    );
  });

  test("bookings page loads without server error", async ({ page }) => {
    await page.goto("/provider/bookings");
    await expect(page.locator("text=/500|Internal Server Error/i")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /bookings/i })).toBeVisible({ timeout: 20_000 });
  });

  test("calendar page loads without server error", async ({ page }) => {
    await page.goto("/provider/calendar");
    await expect(page.locator("text=/500|Internal Server Error/i")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /calendar/i })).toBeVisible({ timeout: 20_000 });
  });

  test("bookings page shows day hub tabs", async ({ page }) => {
    await page.goto("/provider/bookings");
    await expect(page.getByRole("button", { name: /day/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /overview/i })).toBeVisible();
  });

  test("overview tab lists booking filters", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.getByPlaceholder(/search client/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /to review/i })).toBeVisible();
  });

  test("create flow opens from quick actions", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /new booking/i }).first().click();
    await expect(page.getByText(/new appointment|create booking|client/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("overview tab sort toggle", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.getByRole("button", { name: /by appointment time/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /by booked time/i }).click();
    await expect(page.getByRole("button", { name: /by booked time/i })).toHaveClass(/bg-gray-900/);
  });
});
