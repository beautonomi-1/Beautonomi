import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveSubscriptionOnlineGatewayId = vi.fn();
const mockFetchCustomer = vi.fn();
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
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
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
  subscriptionGatewayUsesPaystackCustomer: () => true,
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  fetchCustomer: (...args: unknown[]) => mockFetchCustomer(...args),
  createCustomer: vi.fn(),
}));

vi.mock("@/lib/payments/online-payment", () => ({
  initializeOnlinePayment: (...args: unknown[]) => mockInitializeOnlinePayment(...args),
}));

vi.mock("@/lib/subscriptions/provider-billing-merchant", () => ({
  failPendingProviderSubscriptionOrders: (...args: unknown[]) =>
    mockFailPendingProviderSubscriptionOrders(...args),
}));

function supabaseForInitPayment() {
  return {
    from: (table: string) => {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { tenant_id: "tenant-za" },
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
                data: { email: "owner@example.com" },
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
                  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                  name: "Pro",
                  currency: "ZAR",
                  price_monthly: 100,
                  price_yearly: 1000,
                  is_active: true,
                  is_free: false,
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
                data: { id: "order-1" },
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

describe("POST /api/provider/subscription/initialize-payment — in_app HTTPS callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com", role: "provider_owner" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue(supabaseForInitPayment());
    mockResolveSubscriptionOnlineGatewayId.mockResolvedValue("paystack");
    mockFetchCustomer.mockResolvedValue({ data: { customer_code: "CUS_1" } });
    mockFailPendingProviderSubscriptionOrders.mockResolvedValue(undefined);
    mockInitializeOnlinePayment.mockResolvedValue({
      authorizationUrl: "https://checkout.paystack.com/test",
    });
  });

  it("appends in_app=1 when client sends HTTPS callback_url and in_app true", async () => {
    const { POST } = await import("../route");
    const clientCallback = "https://app.test/provider/subscription?in_app=1";
    const req = new NextRequest(
      "http://localhost/api/provider/subscription/initialize-payment",
      {
        method: "POST",
        body: JSON.stringify({
          plan_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          billing_period: "monthly",
          in_app: true,
          callback_url: clientCallback,
        }),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockInitializeOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl: expect.stringMatching(/^https:\/\/app\.test\/provider\/subscription\?/),
      }),
    );
    const call = mockInitializeOnlinePayment.mock.calls[0][0] as { callbackUrl: string };
    expect(call.callbackUrl).toContain("in_app=1");
    expect(call.callbackUrl).toContain("payment_success=true");
    expect(call.callbackUrl).toContain("order_id=order-1");
  });
});
