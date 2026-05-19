/**
 * GET /api/public/gift-cards/marketplace flag gate.
 *
 * Previously this route always returned templates, so /gift-card/purchase showed
 * design cards even when the gift_cards feature flag was off (and the POST
 * route would 403 the eventual checkout). The route now mirrors the purchase
 * route's flag gate so disabling gift cards is consistent across the funnel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockResolveTenantIdWithZaFallback = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

const mockGetPaymentFeatureFlagsForTenant = vi.fn();
vi.mock("@/lib/subscriptions/entitlements", () => ({
  getPaymentFeatureFlagsForTenant: (...args: unknown[]) =>
    mockGetPaymentFeatureFlagsForTenant(...args),
}));

const mockGetTenantRegionConfig = vi.fn();
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

const mockGetPublicPageContent = vi.fn();
vi.mock("@/lib/content/getPublicPageContent", () => ({
  getPublicPageContent: (...args: unknown[]) => mockGetPublicPageContent(...args),
}));

describe("GET /api/public/gift-cards/marketplace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
    mockGetPublicPageContent.mockResolvedValue(null);
  });

  it("returns 403 with FEATURE_DISABLED when gift_cards flag is off", async () => {
    mockGetPaymentFeatureFlagsForTenant.mockResolvedValue({
      gift_cards: false,
      payment_paystack: true,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/public/gift-cards/marketplace"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FEATURE_DISABLED");
    expect(body.error?.message).toMatch(/unavailable/i);
  });

  it("returns default templates when gift_cards flag is on", async () => {
    mockGetPaymentFeatureFlagsForTenant.mockResolvedValue({
      gift_cards: true,
      payment_paystack: true,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/public/gift-cards/marketplace"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data.templates)).toBe(true);
    expect(body.data.templates.length).toBeGreaterThan(0);
    expect(body.data.templates[0]).toMatchObject({ currency: "ZAR" });
  });
});
