import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveSubscriptionOnlineGatewayId = vi.fn();
const mockFetchCustomer = vi.fn();
const mockCreateCustomer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/tenant/market-availability", () => ({
  assertTransactionalMarketAllowedForTenantId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "GBP" }),
}));

vi.mock("@/lib/iap/apple/ios-eligibility", () => ({
  getAppleBillingPaystackBlock: vi.fn().mockResolvedValue({ blocked: false }),
}));

vi.mock("@/lib/subscriptions/resolve-subscription-online-gateway", () => ({
  resolveSubscriptionOnlineGatewayId: (...args: unknown[]) =>
    mockResolveSubscriptionOnlineGatewayId(...args),
  subscriptionGatewayUsesPaystackCustomer: (gateway: string) => gateway === "paystack",
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  fetchCustomer: (...args: unknown[]) => mockFetchCustomer(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  createSubscription: vi.fn(),
  disableSubscriptionByCode: vi.fn(),
}));

function supabaseForPaidUpgrade() {
  return {
    from: (table: string) => {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { tenant_id: "tenant-uk", timezone: "Europe/London" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "subscription_plans") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "plan-paid-1",
                  name: "Pro",
                  currency: "GBP",
                  price_monthly: 29,
                  price_yearly: 290,
                  is_active: true,
                  is_free: false,
                  paystack_plan_code_monthly: null,
                  paystack_plan_code_yearly: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("POST /api/provider/subscription/upgrade — online gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com", role: "provider_owner" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-uk");
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue(supabaseForPaidUpgrade());
  });

  it("returns requires_payment for Stripe without calling Paystack customer APIs", async () => {
    mockResolveSubscriptionOnlineGatewayId.mockResolvedValue("stripe");

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/subscription/upgrade", {
      method: "POST",
      body: JSON.stringify({ plan_id: "plan-paid-1", billing_period: "monthly" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data?.requires_payment).toBe(true);
    expect(mockFetchCustomer).not.toHaveBeenCalled();
    expect(mockCreateCustomer).not.toHaveBeenCalled();
  });
});
