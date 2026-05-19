/**
 * POST /api/public/gift-cards/purchase — attribution + flag gating.
 *
 * Pins the bulk vs single source so that finance reports and the webhook can
 * tell them apart and the order metadata mirrors the buyer's intent. Also
 * verifies the gift_cards feature flag returns 403 with the expected code.
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

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(),
}));

const mockGetTenantRegionConfig = vi.fn();
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

const mockCheckPublicMutationRateLimit = vi.fn();
vi.mock("@/lib/rate-limit/public-mutation", () => ({
  checkPublicMutationRateLimit: (...args: unknown[]) => mockCheckPublicMutationRateLimit(...args),
}));

const mockInitializePaystackTransaction = vi.fn();
vi.mock("@/lib/payments/paystack-server", () => ({
  initializePaystackTransaction: (...args: unknown[]) => mockInitializePaystackTransaction(...args),
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/public/gift-cards/purchase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/public/gift-cards/purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
    mockCheckPublicMutationRateLimit.mockResolvedValue({ allowed: true });
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
    });
    mockInitializePaystackTransaction.mockResolvedValue({
      data: { authorization_url: "https://paystack.com/pay/abc", access_code: "ac", reference: "ref" },
    });
    process.env.NEXT_PUBLIC_APP_URL = "https://beautonomi.co.za";
  });

  it("returns 403 when gift_cards flag is off", async () => {
    mockGetPaymentFeatureFlagsForTenant.mockResolvedValue({
      gift_cards: false,
      payment_paystack: true,
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ amount: 500 }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FEATURE_DISABLED");
  });

  it("infers bulk attribution when quantity > 1 and caller omits source", async () => {
    mockGetPaymentFeatureFlagsForTenant.mockResolvedValue({
      gift_cards: true,
      payment_paystack: true,
    });

    const insertedOrders: Array<{ metadata?: { source?: string; attribution?: { source?: string } } }> = [];
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return {
            insert: vi.fn((row: any) => {
              insertedOrders.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "order-1", ...row },
                    error: null,
                  }),
                })),
              };
            }),
            update: updateSpy,
          };
        }
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: "buyer@example.com" }, error: null }),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ amount: 500, quantity: 5 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.order_id).toBe("order-1");
    expect(insertedOrders[0].metadata?.source).toBe("gift_card_bulk_purchase");
    expect(insertedOrders[0].metadata?.attribution?.source).toBe("gift_card_bulk_purchase");
  });

  it("preserves caller-supplied bulk attribution and quantity", async () => {
    mockGetPaymentFeatureFlagsForTenant.mockResolvedValue({
      gift_cards: true,
      payment_paystack: true,
    });

    const insertedOrders: Array<{ quantity?: number; metadata?: { source?: string } }> = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "gift_card_orders") {
          return {
            insert: vi.fn((row: any) => {
              insertedOrders.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { id: "order-2", ...row }, error: null }),
                })),
              };
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: "buyer@example.com" }, error: null }),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ amount: 250, quantity: 10, source: "gift_card_bulk_purchase" }),
    );

    expect(res.status).toBe(200);
    expect(insertedOrders[0].quantity).toBe(10);
    expect(insertedOrders[0].metadata?.source).toBe("gift_card_bulk_purchase");
  });
});
