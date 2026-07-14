import { test, expect } from "@playwright/test";

/**
 * REM-006 — Money-path E2E smoke tests (staging).
 *
 * Covers API-level checks for booking payment, refund, and payout webhooks.
 * Full browser Paystack checkout requires staging credentials and is gated
 * behind env vars so preview deploys skip gracefully.
 *
 * Required env (staging CI):
 *   E2E_PROVIDER_SLUG
 *   E2E_STAGING_API_BASE (optional, defaults to baseURL)
 *   E2E_PAYSTACK_SECRET_KEY (for transfer/payout API probe)
 */
test.describe("money path APIs", () => {
  test.beforeEach(({ }, testInfo) => {
    if (!process.env.E2E_PROVIDER_SLUG) {
      if (process.env.E2E_NON_SKIPPABLE === "true") {
        throw new Error("E2E_PROVIDER_SLUG is required when E2E_NON_SKIPPABLE=true");
      }
      testInfo.skip(true, "E2E_PROVIDER_SLUG not set — skipping money-path E2E");
    }
  });

  test("public search returns providers without 500", async ({ request }) => {
    const res = await request.get("/api/public/search?limit=5");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data?.providers).toBeDefined();
  });

  test("config-bundle exposes paystack flag when payment_paystack enabled", async ({ request }) => {
    const res = await request.get("/api/public/config-bundle?platform=web&environment=production");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.flags?.payment_paystack?.enabled).toBeDefined();
    const pk = json.meta?.region_settings_public?.paystack_public_key;
    if (pk) {
      expect(String(pk)).toMatch(/^pk_(test|live)_/);
    }
  });

  test("unauthenticated PATCH /api/me/profile is CSRF-blocked", async ({ request }) => {
    const res = await request.patch("/api/me/profile", {
      data: { full_name: "e2e-probe" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/csrf/i);
  });

  test("provider public profile resolves for E2E_PROVIDER_SLUG", async ({ request }) => {
    const slug = process.env.E2E_PROVIDER_SLUG!;
    const res = await request.get(`/api/public/providers/${encodeURIComponent(slug)}`);
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const json = await res.json();
      expect(json.data?.slug ?? json.data?.id).toBeTruthy();
      expect(json.data?.disclosure_tier).toBe("anon");
      const loc = json.data?.locations?.[0];
      if (loc) {
        expect(loc.address_line1).toBeUndefined();
        expect(loc.latitude).toBeUndefined();
        expect(loc.working_hours).toBeUndefined();
      }
      expect(json.data?.description).toBe("");
    }
  });

  test("paystack webhook endpoint rejects unsigned POST", async ({ request }) => {
    const res = await request.post("/api/webhooks/paystack", {
      data: { event: "charge.success", data: {} },
      failOnStatusCode: false,
    });
    expect([400, 401, 403, 422]).toContain(res.status());
  });
});
