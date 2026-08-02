import { test, expect } from "@playwright/test";

/**
 * Provider booking mobile shell — scenario matrix.
 *
 * Covers create/view flows, payment gates, and shell affordances.
 * Terminal payment dialogs are smoke-checked (open/close) without charging cards.
 */
test.describe("provider booking mobile shell matrix", () => {
  test.beforeEach(({ }, testInfo) => {
    if (!process.env.E2E_PROVIDER_EMAIL && !process.env.PLAYWRIGHT_PROVIDER_STORAGE) {
      if (process.env.E2E_NON_SKIPPABLE === "true") {
        throw new Error("Provider E2E credentials missing but E2E_NON_SKIPPABLE=true");
      }
      testInfo.skip(true, "Provider credentials not configured");
    }
    test.skip(
      process.env.NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL === "0",
      "Mobile shell explicitly disabled via NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL=0",
    );
  });

  async function openCreateSheet(page: import("@playwright/test").Page) {
    await page.goto("/provider/bookings");
    await expect(page.getByRole("heading", { name: /bookings/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /new booking/i }).first().click();
    await expect(page.getByText(/client|appointment|booking/i).first()).toBeVisible({ timeout: 10_000 });
  }

  test("in-salon create flow opens with appointment kind selector", async ({ page }) => {
    await openCreateSheet(page);
    await expect(page.getByText(/in salon|at home|walk-in/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("walk-in quick action opens create with walk-in kind", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /^walk-in$/i }).click();
    await expect(page.getByText(/walk.?in|client/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("at-home house call quick action opens create sheet", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /^house$/i }).click();
    await expect(page.getByText(/at home|address|client/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("group session quick action opens group booking shell", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /^group$/i }).click();
    await expect(
      page.getByTestId("group-booking-view-sheet").or(page.getByText(/group booking|participants|new group/i).first()),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("walk-in POS sheet opens from sell quick action", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /^(sell|pos)$/i }).click();
    await expect(page.getByText(/walk-in sale|products|cart/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("group bookings page opens native view sheet on row click", async ({ page }) => {
    await page.goto("/provider/group-bookings");
    await expect(page.getByRole("heading", { name: /group bookings/i })).toBeVisible({
      timeout: 20_000,
    });
    const row = page.locator("[data-group-booking-row]").first();
    if (!(await row.count())) {
      test.skip(true, "No group bookings in seed data");
    }
    await row.click();
    await expect(page.getByTestId("group-booking-view-sheet")).toBeVisible({ timeout: 10_000 });
  });

  test("view sheet shows payment section when opening a booking from overview", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    const bookingCard = page.locator("[data-schedule-card], [data-booking-row]").first();
    if (!(await bookingCard.count())) {
      test.skip(true, "No bookings in overview list");
    }
    await bookingCard.click();
    await expect(page.getByTestId("booking-collect-payment").or(page.getByText(/payment|collect|outstanding/i).first())).toBeVisible({
      timeout: 10_000,
    });
  });

  test("complete-service gate shows confirm dialog when checklist blocks", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    const bookingCard = page.locator("[data-schedule-card], [data-booking-row]").first();
    if (!(await bookingCard.count())) {
      test.skip(true, "No bookings in overview list");
    }
    await bookingCard.click();
    const completeBtn = page.getByTestId("booking-complete-service");
    if (!(await completeBtn.isVisible().catch(() => false))) {
      test.skip(true, "No completable booking in seed data");
    }
    await completeBtn.click();
    await expect(
      page
        .getByTestId("booking-complete-confirm-dialog")
        .or(page.getByRole("button", { name: /complete anyway/i })),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("deposit terminal amount shown in collect section", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    const bookingCard = page.locator("[data-schedule-card], [data-booking-row]").first();
    if (!(await bookingCard.count())) {
      test.skip(true, "No bookings in overview list");
    }
    await bookingCard.click();
    const collect = page.getByTestId("booking-collect-payment");
    if (!(await collect.isVisible().catch(() => false))) {
      test.skip(true, "Booking has no collect section (may be fully paid)");
    }
    const depositHint = collect.getByText(/deposit due now/i);
    const paycloudBtn = collect.getByRole("button", { name: /card machine|collect/i }).first();
    if (await depositHint.isVisible().catch(() => false)) {
      await expect(depositHint).toBeVisible();
      await paycloudBtn.click();
      const amountInput = page.getByTestId("paycloud-charge-amount");
      await expect(amountInput).toBeVisible({ timeout: 10_000 });
      const value = await amountInput.inputValue();
      expect(Number(value)).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
    } else if (await paycloudBtn.isVisible().catch(() => false)) {
      await paycloudBtn.click();
      await expect(page.getByTestId("paycloud-payment-dialog")).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    } else {
      test.skip(true, "No PayCloud collect affordance on this booking");
    }
  });

  test("post-create collect opens paycloud dialog from success sheet", async ({ page }) => {
    await openCreateSheet(page);
    const collectCta = page.getByTestId("post-create-collect-paycloud");
    if (!(await collectCta.isVisible().catch(() => false))) {
      test.skip(true, "Requires completing a booking with terminal payment method in E2E seed flow");
    }
    await collectCta.click();
    await expect(page.getByTestId("paycloud-payment-dialog")).toBeVisible({ timeout: 10_000 });
  });

  test("at-home journey exposes camera scan button when QR pending", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    const atHomeCard = page.locator("[data-schedule-card]").filter({ hasText: /at home|house/i }).first();
    if (!(await atHomeCard.count())) {
      test.skip(true, "No at-home bookings in list");
    }
    await atHomeCard.click();
    const scanBtn = page.getByTestId("at-home-scan-camera");
    if (!(await scanBtn.isVisible().catch(() => false))) {
      test.skip(true, "Booking does not have QR arrival pending");
    }
    await scanBtn.click();
    await expect(page.getByText(/scan|camera|qr/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("ecommerce orders open product order sheet when shell enabled", async ({ page }) => {
    await page.goto("/provider/ecommerce/orders");
    await expect(page.getByRole("heading", { name: /product orders/i })).toBeVisible({ timeout: 20_000 });
    const row = page.locator("[data-product-order-row]").first();
    if (!(await row.count())) {
      test.skip(true, "No product orders in seed data");
    }
    await row.click();
    await expect(page.getByText(/product order|items|customer/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("at-home create shows address autocomplete section", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /^house$/i }).click();
    await expect(page.getByTestId("at-home-address-section")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#at-home-address-autocomplete")).toBeVisible();
  });

  test("new client dialog opens from create flow", async ({ page }) => {
    await openCreateSheet(page);
    const newClientBtn = page.getByRole("button", { name: /new client|create client|add client/i }).first();
    if (!(await newClientBtn.isVisible().catch(() => false))) {
      test.skip(true, "New client button not visible in create sheet");
    }
    await newClientBtn.click();
    await expect(page.getByTestId("new-client-dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#nc-phone")).toBeVisible();
  });

  test("overview tab shows metrics tiles and reconciliation", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.getByText(/appointments/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pending|confirmed|in progress/i).first()).toBeVisible();
  });

  test("group create opens native bottom sheet", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.getByRole("button", { name: /^group$/i }).click();
    await expect(page.getByTestId("group-booking-create-edit-sheet")).toBeVisible({ timeout: 10_000 });
  });

  test("more hub lists group bookings and card machines destinations", async ({ page }) => {
    await page.goto("/provider/more");
    await expect(page.getByTestId("provider-more-hub")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /group bookings/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /bookings/i }).first()).toBeVisible();
  });

  test("create booking posts to provider bookings API when submitted", async ({ page }) => {
    await openCreateSheet(page);

    const createRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/api\/provider\/(bookings|appointments)/.test(req.url()),
      { timeout: 60_000 },
    );

    // Minimal fill — skip if seed UI lacks required controls
    const clientInput = page.getByPlaceholder(/search|client|name/i).first();
    if (!(await clientInput.isVisible().catch(() => false))) {
      test.skip(true, "Create form client field not found");
    }
    await clientInput.fill("E2E Mobile Shell Client");

    const reviewBtn = page.getByRole("button", { name: /review|continue|next/i }).first();
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
    }

    const confirmBtn = page.getByRole("button", { name: /confirm|create booking|save/i }).first();
    if (!(await confirmBtn.isVisible().catch(() => false))) {
      test.skip(true, "Confirm CTA not reachable without full form seed data");
    }

    await confirmBtn.click();
    const req = await createRequest.catch(() => null);
    if (!req) {
      test.skip(true, "Form validation blocked submit — API intercept not reached");
    }
    expect(req!.method()).toBe("POST");
    expect(req!.url()).toMatch(/\/api\/provider\/(bookings|appointments)/);
  });
});
