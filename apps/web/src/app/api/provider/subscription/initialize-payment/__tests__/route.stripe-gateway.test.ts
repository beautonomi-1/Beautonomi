import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveSubscriptionOnlineGatewayId = vi.fn();
const mockFetchCustomer = vi.fn();
const mockCreateCustomer = vi.fn();
const mockInitializeOnlinePayment = vi.fn();
const mockFailPendingProviderSubscriptionOrders = vi.fn();

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

vi.mock("@/lib/fx/assert-reporting-currency-ready", () => ({
  assertReportingCurrencyReady: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/subscriptions/resolve-subscription-online-gateway", () => ({
  resolveSubscriptionOnlineGatewayId: (...args: unknown[]) =>
    mockResolveSubscriptionOnlineGatewayId(...args),
  subscriptionGatewayUsesPaystackCustomer: (gateway: string) => gateway === "paystack",
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  fetchCustomer: (...args: unknown[]) => mockFetchCustomer(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
}));

vi.mock("@/lib/payments/online-payment", () => ({
  initializeOnlinePayment: (...args: unknown[]) => mockInitializeOnlinePayment(...args),
}));

vi.mock("@/lib/subscriptions/provider-billing-merchant", () => ({
  failPendingProviderSubscriptionOrders: (...args: unknown[]) =>
    mockFailPendingProviderSubscriptionOrders(...args),
}));

function supabaseForInitPayment() {
  const orderId = "order-1";
  return {
    from: (table: string) => {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { tenant_id: "tenant-uk" },
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
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  email: "owner@example.com",
                  first_name: "Owner",
                  last_name: "Example",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "provider_subscription_orders") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: orderId, provider_id: "provider-1" },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("POST /api/provider/subscription/initialize-payment — online gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com", role: "provider_owner" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-uk");
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue(supabaseForInitPayment());
    mockResolveSubscriptionOnlineGatewayId.mockResolvedValue("stripe");
    mockFailPendingProviderSubscriptionOrders.mockResolvedValue(undefined);
    mockInitializeOnlinePayment.mockResolvedValue({
      authorizationUrl: "https://checkout.stripe.test/session",
    });
  });

  it("initializes checkout without Paystack customer when gateway is Stripe", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost/api/provider/subscription/initialize-payment",
      {
        method: "POST",
        body: JSON.stringify({ plan_id: "plan-paid-1", billing_period: "monthly" }),
      },
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data?.payment_url).toContain("stripe");
    expect(mockFetchCustomer).not.toHaveBeenCalled();
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockInitializeOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-uk",
        callbackUrl: expect.stringMatching(/payment_success=true.*reference=/),
        metadata: expect.objectContaining({
          customer_code: "owner@example.com",
        }),
      }),
    );
  });
});
