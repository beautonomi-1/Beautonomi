import { test, expect } from "@playwright/test";

/**
 * Card machine APIs — auth and webhook smoke (no terminal hardware).
 */
test.describe("card machines API smoke", () => {
  test("GET /api/provider/card-machines requires authentication", async ({ request }) => {
    const res = await request.get("/api/provider/card-machines", { failOnStatusCode: false });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/provider/yoco/webhook rejects missing signature", async ({ request }) => {
    const res = await request.post("/api/provider/yoco/webhook", {
      data: { type: "payment.notification", payload: {} },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json)).toMatch(/signature/i);
  });

  test("POST /api/provider/paycloud/webhook rejects invalid body without success", async ({
    request,
  }) => {
    const res = await request.post("/api/provider/paycloud/webhook", {
      data: "not-json",
      headers: { "content-type": "text/plain" },
      failOnStatusCode: false,
    });
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test("config-bundle exposes card-machine feature flags", async ({ request }) => {
    const res = await request.get("/api/public/config-bundle?platform=web&environment=production");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.flags?.payment_yoco?.enabled).toBeDefined();
    expect(json.flags?.payment_paycloud?.enabled).toBeDefined();
  });
});
