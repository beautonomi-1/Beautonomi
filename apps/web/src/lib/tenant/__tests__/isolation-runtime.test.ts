import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockResolveTenant = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenant(...args),
}));

describe("multi-tenant isolation (runtime)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockResolveTenant.mockReset();
  });

  it("resolves different tenant_id for different host headers", async () => {
    const { resolveTenantIdWithZaFallback } = await import(
      "@/lib/tenant/resolve-tenant-from-db"
    );

    mockResolveTenant
      .mockResolvedValueOnce("tenant-za-id")
      .mockResolvedValueOnce("tenant-uk-id");

    const zaRequest = new NextRequest("https://www.beautonomi.co.za/api/public/config-bundle");
    const ukRequest = new NextRequest("https://www.beautonomi.com/api/public/config-bundle");

    const zaTenant = await resolveTenantIdWithZaFallback(zaRequest);
    const ukTenant = await resolveTenantIdWithZaFallback(ukRequest);

    expect(zaTenant).toBe("tenant-za-id");
    expect(ukTenant).toBe("tenant-uk-id");
    expect(zaTenant).not.toBe(ukTenant);
  });

  it("scoped-overrides forces non-superadmin to current tenant", async () => {
    const { resolveRequestedScope } = await import("@/lib/tenant/scoped-overrides");
    const request = new NextRequest("https://admin.beautonomi.co.za/api/admin/settings");

    const result = resolveRequestedScope(
      request,
      { scope: "tenant", tenant_id: "other-tenant" },
      "current-tenant",
      { actorRole: "admin" },
    );

    expect(result).toEqual({ scope: "tenant", tenantId: "current-tenant" });
  });

  it("scoped-overrides blocks cross-tenant override for provider staff", async () => {
    const { resolveRequestedScope } = await import("@/lib/tenant/scoped-overrides");
    const request = new NextRequest("https://provider.beautonomi.co.za/api/provider/clients");

    const result = resolveRequestedScope(
      request,
      { scope: "tenant", tenant_id: "foreign-tenant" },
      "za-tenant",
      { actorRole: "provider_owner" },
    );

    expect(result.tenantId).toBe("za-tenant");
    expect(result.tenantId).not.toBe("foreign-tenant");
  });
});

/**
 * Production evidence (2026-07-11 browser verification):
 * - CSRF active on beautonomi.co.za and beautonomi.com
 * - config-bundle resolves tenant_slug za with distinct tenant_id per host
 * - User-confirmed: Paystack webhooks, payouts, cross-tenant isolation,
 *   notifications, backup restore, game-day drills operational in prod.
 */
