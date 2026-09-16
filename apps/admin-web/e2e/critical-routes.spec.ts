import { test, expect } from "@playwright/test";
import { expectAdminSessionGate } from "./helpers/sessionGate";

/**
 * Static-shell smoke for operator-overhaul critical routes (vite preview, no API).
 * Asserts the SPA loads and shows the session gate — not authenticated data flows.
 */

const CRITICAL_ROUTE_PATHS = [
  "/admin/dashboard",
  "/admin/bookings",
  "/admin/support-tickets",
  "/admin/payouts",
  "/admin/refunds",
  "/admin/disputes",
  "/admin/fraud-cases",
  "/admin/provider-ops/leads",
  "/admin/provider-ops/activation",
  "/admin/notifications/inbox",
  "/admin/audit-logs",
  "/admin/wallet-reconciliation",
  "/admin/reconciliation-exceptions",
  "/admin/ledger-repair",
  "/admin/period-locks",
  "/admin/marketing",
  "/admin/integrations-hub",
  "/admin/operations",
  "/admin/platform-config",
  "/admin/support-tickets/ai-drafts",
  "/admin/finance/ai-queue",
  "/admin/trust-safety-ops/ai-queue",
  "/admin/provider-ops/ai-queue",
  "/admin/control-plane/modules/agents",
] as const;

test.describe("operator overhaul critical routes (static shell)", () => {
  for (const path of CRITICAL_ROUTE_PATHS) {
    test(`${path} loads session gate without 404`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(500);
      await expectAdminSessionGate(page);
    });
  }

  test("login page exposes email and password fields", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: /admin sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("support tickets saved-view query params do not crash shell", async ({ page }) => {
    await page.goto("/admin/support-tickets?saved_view=breaching_sla", { waitUntil: "domcontentloaded" });
    await expectAdminSessionGate(page);
  });

  test("refunds saved-view query params do not crash shell", async ({ page }) => {
    await page.goto("/admin/refunds?saved_view=actionable", { waitUntil: "domcontentloaded" });
    await expectAdminSessionGate(page);
  });
});
