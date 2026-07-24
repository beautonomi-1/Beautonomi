import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * FND-P0-003 (REM-007) — Multi-market tenant isolation E2E (staging).
 *
 * Verifies, against two LIVE market hosts, that:
 *   1. Each host resolves to a distinct tenant (config-bundle tenant_slug/id).
 *   2. A provider that exists in market A is NOT resolvable from market B's host
 *      (cross-tenant read isolation at the edge).
 *
 * Gated on staging env so preview deploys skip gracefully.
 *
 * Required env (staging CI):
 *   E2E_TENANT_A_BASE       e.g. https://www.beautonomi.co.za
 *   E2E_TENANT_B_BASE       e.g. https://www.beautonomi.com
 *   E2E_TENANT_A_PROVIDER   a provider slug that exists ONLY in tenant A
 *   E2E_NON_SKIPPABLE=true  (optional) fail instead of skip when env missing
 */

const A_BASE = process.env.E2E_TENANT_A_BASE;
const B_BASE = process.env.E2E_TENANT_B_BASE;
const A_PROVIDER = process.env.E2E_TENANT_A_PROVIDER;

test.describe("multi-market tenant isolation", () => {
  test.beforeEach(({}, testInfo) => {
    if (!A_BASE || !B_BASE) {
      if (process.env.E2E_NON_SKIPPABLE === "true") {
        throw new Error("E2E_TENANT_A_BASE and E2E_TENANT_B_BASE are required when E2E_NON_SKIPPABLE=true");
      }
      testInfo.skip(true, "E2E_TENANT_A_BASE/E2E_TENANT_B_BASE not set — skipping tenant-isolation E2E");
    }
  });

  test("each market host resolves to a distinct tenant", async () => {
    const ctxA = await pwRequest.newContext({ baseURL: A_BASE });
    const ctxB = await pwRequest.newContext({ baseURL: B_BASE });
    try {
      const [resA, resB] = await Promise.all([
        ctxA.get("/api/public/config-bundle?platform=web&environment=production"),
        ctxB.get("/api/public/config-bundle?platform=web&environment=production"),
      ]);
      expect(resA.status()).toBe(200);
      expect(resB.status()).toBe(200);
      const [jsonA, jsonB] = await Promise.all([resA.json(), resB.json()]);

      const tenantA = jsonA.meta?.tenant_id ?? jsonA.meta?.tenant?.id;
      const tenantB = jsonB.meta?.tenant_id ?? jsonB.meta?.tenant?.id;
      expect(tenantA, "tenant A must resolve a tenant_id").toBeTruthy();
      expect(tenantB, "tenant B must resolve a tenant_id").toBeTruthy();
      expect(tenantA).not.toBe(tenantB);
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });

  test("a tenant-A provider is not resolvable from the tenant-B host", async () => {
    test.skip(!A_PROVIDER, "E2E_TENANT_A_PROVIDER not set");
    const ctxA = await pwRequest.newContext({ baseURL: A_BASE });
    const ctxB = await pwRequest.newContext({ baseURL: B_BASE });
    try {
      const path = `/api/public/providers/${encodeURIComponent(A_PROVIDER!)}`;
      const resA = await ctxA.get(path);
      // Exists in its own market.
      expect(resA.status()).toBe(200);

      // Must NOT leak into the other market: 404, or 200 with no usable payload.
      const resB = await ctxB.get(path);
      if (resB.status() === 200) {
        const jsonB = await resB.json();
        expect(
          jsonB.data?.slug ?? jsonB.data?.id ?? null,
          "provider must not be resolvable from the foreign-tenant host",
        ).toBeNull();
      } else {
        expect([404, 403]).toContain(resB.status());
      }
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });
});
