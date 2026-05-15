import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetPaystackSecretKey = vi.fn();
const mockRecordProductOrderPayment = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

function adsBudgetOrdersEmptyByReference() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    })),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "ads_budget_orders") return adsBudgetOrdersEmptyByReference();
      if (table === "provider_subscription_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      return {};
    }),
  })),
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

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-za"),
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: vi.fn(async () => ({ format: (value: number) => `R${value.toFixed(2)}` })),
}));

vi.mock("@/lib/notifications/notify-provider-team", () => ({
  notifyProviderTeamUsers: vi.fn(async () => undefined),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecordProductOrderPayment(...args),
}));

vi.mock("@/lib/wallet/apply-wallet-topup-from-paystack-success", () => ({
  applyWalletTopupFromSuccessfulPaystackCharge: vi.fn(),
}));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: vi.fn(),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(() => Promise.resolve()),
}));

function productOrdersQuery(row: Record<string, unknown> | null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        single: vi.fn(async () => ({ data: row, error: null })),
      })),
    })),
  };
}

describe("GET /api/paystack/verify product orders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetPaystackSecretKey.mockResolvedValue("sk_test");
    mockRecordProductOrderPayment.mockResolvedValue({ ok: true, duplicate: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            status: "success",
            amount: 10_000,
            fees: 200,
            currency: "ZAR",
            metadata: { product_order_id: "order-1" },
          },
        }),
      })),
    );
  });

  it("rejects product-order verification for a different customer", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "product_orders") throw new Error(`Unexpected table ${table}`);
        return productOrdersQuery({
          id: "order-1",
          tenant_id: "tenant-za",
          provider_id: "provider-1",
          customer_id: "someone-else",
          total_amount: 100,
          wallet_amount: 0,
          payment_status: "pending",
          payment_reference: null,
        });
      }),
    });

    const { GET } = await import("../verify/route");
    const res = await GET(new NextRequest("http://localhost/api/paystack/verify?reference=ref-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockRecordProductOrderPayment).not.toHaveBeenCalled();
  });

  it("rejects product-order verification when Paystack amount does not match amount due", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "product_orders") throw new Error(`Unexpected table ${table}`);
        return productOrdersQuery({
          id: "order-1",
          tenant_id: "tenant-za",
          provider_id: "provider-1",
          customer_id: "customer-1",
          total_amount: 120,
          wallet_amount: 0,
          payment_status: "pending",
          payment_reference: null,
        });
      }),
    });

    const { GET } = await import("../verify/route");
    const res = await GET(new NextRequest("http://localhost/api/paystack/verify?reference=ref-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body?.error?.code).toBe("AMOUNT_MISMATCH");
    expect(mockRecordProductOrderPayment).not.toHaveBeenCalled();
  });
});
