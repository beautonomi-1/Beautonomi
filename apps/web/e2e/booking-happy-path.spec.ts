import { test, expect } from "@playwright/test";
import { dismissCookieBannerIfVisible, seedCookieConsent } from "./_consent";

/**
 * F16 — Booking happy-path smoke test.
 *
 * Verifies that a customer can:
 *  1. Land on the canonical /booking page
 *  2. See the provider name + services
 *  3. Open the calendar step
 *  4. Get to a checkout / payment step without 500-ing
 *
 * Gate: requires `E2E_PROVIDER_SLUG` env var.
 *
 * Skip behaviour:
 *   - If `E2E_NON_SKIPPABLE=true` (set by CI on seeded Staging deployments),
 *     missing slug is a hard failure — the seed step must have run.
 *   - Otherwise (Preview deployments without a seed provider), the test is
 *     skipped gracefully so it doesn't block preview deploys.
 */
test.describe("booking happy path", () => {
  test.setTimeout(240_000);

  test.beforeAll(async ({ request }) => {
    await request.get("/booking", { timeout: 120_000, failOnStatusCode: false });
  });

  test.beforeEach(async ({ page }, testInfo) => {
    await seedCookieConsent(page);
    if (!process.env.E2E_PROVIDER_SLUG) {
      if (process.env.E2E_NON_SKIPPABLE === "true") {
        throw new Error(
          "E2E_PROVIDER_SLUG is not set but E2E_NON_SKIPPABLE=true. " +
          "The seed-staging step must have failed — check the CI logs."
        );
      }
      testInfo.skip(true, "E2E_PROVIDER_SLUG is not set — skipping booking happy-path.");
    }
  });

  test("redirects /book/[slug] -> /booking (308)", async ({ request }) => {
    const slug = process.env.E2E_PROVIDER_SLUG!;
    const res = await request.get(`/book/${encodeURIComponent(slug)}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect([301, 307, 308]).toContain(res.status());
    const location = res.headers()["location"];
    expect(location).toMatch(/\/booking\?/);
    expect(location).toContain(`slug=${encodeURIComponent(slug)}`);
  });

  test("customer can reach the payment step", async ({ page }) => {
    const slug = process.env.E2E_PROVIDER_SLUG!;
    const serviceId =
      process.env.E2E_OFFERING_ID ?? "00000000-e2e0-4000-d000-000000000001";

    const holdStatuses: number[] = [];
    page.on("response", (res) => {
      const req = res.request();
      if (req.method() === "POST" && /\/api\/public\/booking-holds$/.test(new URL(res.url()).pathname)) {
        holdStatuses.push(res.status());
      }
    });

    await page.goto(
      `/booking?slug=${encodeURIComponent(slug)}&service=${encodeURIComponent(serviceId)}&reset=1`,
      { waitUntil: "domcontentloaded", timeout: 180_000 },
    );
    await dismissCookieBannerIfVisible(page);

    await expect(page.getByTestId("booking-flow")).toBeVisible({
      timeout: 180_000,
    });

    // Deep-linked service should preselect; otherwise tap the first card.
    const continueBtn = page.getByTestId("booking-continue");
    await expect(continueBtn).toBeVisible({ timeout: 180_000 });
    const service = page.getByTestId("service-card").first();
    if (!(await continueBtn.isEnabled().catch(() => false))) {
      await expect(service).toBeVisible({ timeout: 180_000 });
      await service.click();
    }
    await expect(continueBtn).toBeEnabled({ timeout: 60_000 });

    // Advance through canonical steps (services → venue → calendar → … → payment).
    for (let i = 0; i < 12; i++) {
      const onPayment = await page
        .getByRole("heading", { name: /review|pay|confirm/i })
        .isVisible()
        .catch(() => false);
      if (onPayment) break;

      const next = page
        .getByTestId("booking-continue")
        .or(page.getByRole("button", { name: /next|continue|select time/i }))
        .first();
      if (!(await next.isVisible().catch(() => false))) break;
      if (await next.isDisabled().catch(() => false)) {
        const nextAvail = page.getByRole("button", { name: /next available slot/i });
        if (await nextAvail.isVisible().catch(() => false)) {
          await nextAvail.click();
          await page.waitForTimeout(2_000);
        }
        const day = page.locator('[data-testid="calendar-day"]:not([disabled])').first();
        if (await day.isVisible().catch(() => false)) {
          await day.click();
          const slot = page.locator('[data-testid="time-slot"]').first();
          if (await slot.isVisible().catch(() => false)) await slot.click();
        }
        if (await next.isDisabled().catch(() => false)) break;
      }
      await dismissCookieBannerIfVisible(page);
      await next.click({ force: true });
      await page.waitForTimeout(800);
    }

    await expect(page.locator("text=/500|Internal Server Error|Something went wrong/i")).toHaveCount(0);
    const reachedPayment = await page
      .getByRole("heading", { name: /review|pay|confirm|payment/i })
      .isVisible()
      .catch(() => false);
    const reachedCalendar = await page
      .getByRole("button", { name: /next available slot/i })
      .or(page.locator('[data-testid="calendar-day"]'))
      .first()
      .isVisible()
      .catch(() => false);
    expect(reachedPayment || reachedCalendar).toBe(true);

    // Leaving the calendar must create a slot hold; a 4xx here is the "failed to hold slot" regression.
    expect(holdStatuses.length, "no booking hold was attempted").toBeGreaterThan(0);
    expect(holdStatuses.every((s) => s < 300), `hold statuses: ${holdStatuses.join(",")}`).toBe(true);
    await expect(page.getByText(/could not reserve your time slot/i)).toHaveCount(0);
  });
});
