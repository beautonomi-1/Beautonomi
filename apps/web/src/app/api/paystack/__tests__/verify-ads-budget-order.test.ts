import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetPaystackSecretKey = vi.fn();
const mockProcessSuccessfulPayment = vi.fn();

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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  getPaystackSecretKey: (...args: unknown[]) => mockGetPaystackSecretKey(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: (...args: unknown[]) => mockProcessSuccessfulPayment(...args),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(() => Promise.resolve()),
}));

const ADS_ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADS_CAMPAIGN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADS_PROVIDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAYSTACK_REF = `ads_budget_${ADS_ORDER_ID}_1730000000000`;

function adminClientForAdsVerify() {
  return {
    from: vi.fn((table: string) => {
      if (table === "ads_budget_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, val: string) => ({
              maybeSingle: vi.fn(async () => {
                if (column === "paystack_reference") {
                  expect(val).toBe(PAYSTACK_REF);
                  return {
                    data: {
                      id: ADS_ORDER_ID,
                      campaign_id: ADS_CAMPAIGN_ID,
                      provider_id: ADS_PROVIDER_ID,
                    },
                    error: null,
                  };
                }
                if (column === "id") {
                  expect(val).toBe(ADS_ORDER_ID);
                  return {
                    data: {
                      id: ADS_ORDER_ID,
                      provider_id: ADS_PROVIDER_ID,
                      campaign_id: ADS_CAMPAIGN_ID,
                      amount: 100,
                      status: "pending",
                      currency: "ZAR",
                    },
                    error: null,
                  };
                }
                throw new Error(`Unexpected ads_budget_orders.eq(${column})`);
              }),
            })),
          })),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { tenant_id: "tenant-za" },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "provider_subscription_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  };
}

describe("GET /api/paystack/verify ads budget orders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "provider-user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(ADS_PROVIDER_ID);
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetPaystackSecretKey.mockResolvedValue("sk_test");
    mockGetSupabaseAdmin.mockImplementation(adminClientForAdsVerify);
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    });
    mockProcessSuccessfulPayment.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            status: "success",
            reference: PAYSTACK_REF,
            amount: 10_000,
            fees: 200,
            currency: "ZAR",
            // Paystack verify sometimes omits custom metadata; DB row still has paystack_reference.
            metadata: {},
          },
        }),
      })),
    );
  });

  it("enriches metadata from ads_budget_orders by paystack_reference and calls processSuccessfulPayment", async () => {
    const { GET } = await import("../verify/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/paystack/verify?reference=${encodeURIComponent(PAYSTACK_REF)}`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.status).toBe("success");
    expect(body?.data?.type).toBe("ads_budget_order");
    expect(mockProcessSuccessfulPayment).toHaveBeenCalledTimes(1);
    const [chargePayload] = mockProcessSuccessfulPayment.mock.calls[0] as [{ metadata?: Record<string, unknown> }];
    expect(chargePayload.metadata?.ads_budget_order_id).toBe(ADS_ORDER_ID);
    expect(chargePayload.metadata?.campaign_id).toBe(ADS_CAMPAIGN_ID);
    expect(chargePayload.metadata?.provider_id).toBe(ADS_PROVIDER_ID);
  });
});
