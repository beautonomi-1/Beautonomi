import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockOptionalAuthInApi,
  mockGetSupabaseAdmin,
  mockResolveTenantIdWithZaFallback,
  mockGetPaystackSecretKey,
  mockApplyWalletTopup,
  mockPaystackFetch,
} = vi.hoisted(() => ({
  mockOptionalAuthInApi: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockResolveTenantIdWithZaFallback: vi.fn(),
  mockGetPaystackSecretKey: vi.fn(),
  mockApplyWalletTopup: vi.fn(),
  mockPaystackFetch: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    optionalAuthInApi: (...args: unknown[]) => mockOptionalAuthInApi(...args),
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

vi.mock("@/lib/wallet/apply-wallet-topup-from-paystack-success", () => ({
  applyWalletTopupFromSuccessfulPaystackCharge: (...args: unknown[]) => mockApplyWalletTopup(...args),
}));

vi.mock("@/lib/marketing/apply-marketing-topup-from-paystack", () => ({
  applyMarketingTopupFromPaystackSuccess: vi.fn(),
}));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: vi.fn(),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: vi.fn(async () => ({ ok: true, ledgerIncomplete: false })),
}));

vi.mock("@/lib/notifications/notify-product-order-paid", () => ({
  notifyProductOrderPaidIfTransitioned: vi.fn(async () => undefined),
}));

const TOPUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYSTACK_REF = `wallet_topup_${TOPUP_ID}`;

function adminClientForWalletVerify() {
  const walletTxSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: "wt-1" }, error: null })),
        })),
      })),
    })),
  }));
  return {
    from: vi.fn((table: string) => {
      if (table === "wallet_topups") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string) => ({
              maybeSingle: vi.fn(async () => {
                if (col === "paystack_reference") {
                  return { data: { id: TOPUP_ID }, error: null };
                }
                if (col === "id") {
                  return { data: { user_id: "user-1" }, error: null };
                }
                return { data: null, error: null };
              }),
            })),
          })),
        };
      }
      if (table === "wallet_transactions") {
        return { select: walletTxSelect };
      }
      if (table === "provider_subscription_orders" || table === "ads_budget_orders") {
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

describe("GET /api/paystack/verify wallet top-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptionalAuthInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetPaystackSecretKey.mockResolvedValue("sk_test");
    mockGetSupabaseAdmin.mockImplementation(adminClientForWalletVerify);
    mockApplyWalletTopup.mockResolvedValue(undefined);
    mockPaystackFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "success",
          amount: 10_000,
          fees: 200,
          currency: "ZAR",
          reference: PAYSTACK_REF,
          metadata: {},
        },
      }),
    });
    vi.stubGlobal("fetch", mockPaystackFetch);
  });

  it("recovers wallet_topup_id from reference and credits with fees", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/paystack/verify?reference=${encodeURIComponent(PAYSTACK_REF)}`),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.type).toBe("wallet_topup");
    expect(mockApplyWalletTopup).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: PAYSTACK_REF,
        fees: 200,
        metadata: expect.objectContaining({ wallet_topup_id: TOPUP_ID }),
      }),
      expect.anything(),
    );
  });
});
