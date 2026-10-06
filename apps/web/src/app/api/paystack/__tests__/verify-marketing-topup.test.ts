import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockOptionalAuthInApi,
  mockGetProviderIdForUser,
  mockGetSupabaseAdmin,
  mockResolveTenantIdWithZaFallback,
  mockGetPaystackSecretKey,
  mockApplyMarketingTopup,
  mockProcessSuccessfulPayment,
  mockPaystackFetch,
} = vi.hoisted(() => ({
  mockOptionalAuthInApi: vi.fn(),
  mockGetProviderIdForUser: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockResolveTenantIdWithZaFallback: vi.fn(),
  mockGetPaystackSecretKey: vi.fn(),
  mockApplyMarketingTopup: vi.fn(),
  mockProcessSuccessfulPayment: vi.fn(),
  mockPaystackFetch: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    optionalAuthInApi: (...args: unknown[]) => mockOptionalAuthInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

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

vi.mock("@/lib/marketing/apply-marketing-topup-from-paystack", () => ({
  applyMarketingTopupFromPaystackSuccess: (...args: unknown[]) => mockApplyMarketingTopup(...args),
}));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: (...args: unknown[]) => mockProcessSuccessfulPayment(...args),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/wallet/apply-wallet-topup-from-paystack-success", () => ({
  applyWalletTopupFromSuccessfulPaystackCharge: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: vi.fn(async () => ({ ok: true, ledgerIncomplete: false })),
}));

vi.mock("@/lib/notifications/notify-product-order-paid", () => ({
  notifyProductOrderPaidIfTransitioned: vi.fn(async () => undefined),
}));

const PROVIDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAYSTACK_REF = `marketing_topup_${PROVIDER_ID}_1730000000000`;

function adminClientForMarketingVerify() {
  return {
    from: vi.fn((table: string) => {
      if (table === "provider_subscription_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === "wallet_topups") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === "ads_budget_orders") {
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

import { GET } from "../verify/route";

describe("GET /api/paystack/verify marketing credit top-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalAuthInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetPaystackSecretKey.mockResolvedValue("sk_test");
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseAdmin.mockImplementation(adminClientForMarketingVerify);
    mockApplyMarketingTopup.mockResolvedValue({ credited: true, balance_after: 150 });
    mockProcessSuccessfulPayment.mockResolvedValue(undefined);
    mockPaystackFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "success",
          amount: 5000,
          fees: 0,
          currency: "ZAR",
          reference: PAYSTACK_REF,
          metadata: {
            marketing_credit_topup: true,
            provider_id: PROVIDER_ID,
            amount_zar: 50,
            currency: "ZAR",
          },
        },
      }),
    });
    vi.stubGlobal("fetch", mockPaystackFetch);
  });

  it("credits marketing balance on verify", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/paystack/verify?reference=${encodeURIComponent(PAYSTACK_REF)}`),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.status).toBe("success");
    expect(json.data.type).toBe("marketing_credit_topup");
    expect(mockApplyMarketingTopup).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: PROVIDER_ID,
        paystackReference: PAYSTACK_REF,
        amountZar: 50,
      }),
    );
    expect(mockPaystackFetch).toHaveBeenCalled();
  });
});
