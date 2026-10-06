import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockInitializePaystackTransaction = vi.fn();
const mockResolveProductOrderPaystackAmount = vi.fn();
const mockAssertReportingCurrencyReady = vi.fn();
const mockIsPaystackEnabledForTenant = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/tenant/market-availability", () => ({
  assertTransactionalMarketAllowedForTenantId: vi.fn(async () => null),
}));

vi.mock("@/lib/subscriptions/entitlements", () => ({
  isPaystackEnabledForTenant: (...args: unknown[]) => mockIsPaystackEnabledForTenant(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "order-1",
              tenant_id: "tenant-1",
              customer_id: "user-1",
              currency: "ZAR",
            },
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { currency: "ZAR" },
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
  })),
}));

vi.mock("@/lib/bookings/resolve-payment-tenant", () => ({
  resourceTenantMatchesHostTenant: vi.fn(() => true),
}));

vi.mock("@/lib/payments/resolve-paystack-initialize-amount", () => ({
  resolveProductOrderPaystackAmount: (...args: unknown[]) =>
    mockResolveProductOrderPaystackAmount(...args),
  resolveBookingPaystackAmount: vi.fn(),
}));

vi.mock("@/lib/bookings/revalidate-booking-slot-before-payment", () => ({
  revalidateBookingSlotBeforePayment: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/fx/assert-reporting-currency-ready", () => ({
  assertReportingCurrencyReady: (...args: unknown[]) => mockAssertReportingCurrencyReady(...args),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  initializePaystackTransaction: (...args: unknown[]) => mockInitializePaystackTransaction(...args),
}));

describe("POST /api/paystack/initialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", email: "u@test.com" } });
    mockIsPaystackEnabledForTenant.mockResolvedValue(true);
    mockAssertReportingCurrencyReady.mockResolvedValue({ ok: true });
    mockResolveProductOrderPaystackAmount.mockResolvedValue({
      ok: true,
      amountSmallestUnit: 50000,
    });
    mockInitializePaystackTransaction.mockResolvedValue({
      data: {
        authorization_url: "https://checkout.paystack.com/x",
        reference: "ref_123",
      },
    });
  });

  it("sends currency, HTTPS callback, and no channels for product order", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/paystack/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: "u@test.com",
        metadata: { type: "product_order", product_order_id: "order-1" },
        callback_url: "customer://shop/paystack",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockInitializePaystackTransaction).toHaveBeenCalledTimes(1);
    const arg = mockInitializePaystackTransaction.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.currency).toBe("ZAR");
    expect(String(arg.callback_url)).toMatch(/^https:\/\//);
    expect(arg.channels).toBeUndefined();
    expect(arg.split_code).toBeUndefined();
    expect(arg.subaccount).toBeUndefined();
  });

  it("includes channels card only when save_card metadata is true", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/paystack/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: "u@test.com",
        metadata: {
          type: "product_order",
          product_order_id: "order-1",
          save_card: true,
        },
        callback_url: "customer://shop/paystack",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const arg = mockInitializePaystackTransaction.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.channels).toEqual(["card"]);
  });
});
