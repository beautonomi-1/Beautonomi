import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockInitializeOnlinePayment = vi.fn();
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

vi.mock("@/lib/payments/online-payment", () => ({
  initializeOnlinePayment: (...args: unknown[]) => mockInitializeOnlinePayment(...args),
  isOnlineCardEnabledForTenant: vi.fn(async () => true),
}));

describe("POST /api/paystack/initialize", () => {
  const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    // Paystack rejects non-HTTPS callback_url; isolate from local .env http://localhost.
    process.env.NEXT_PUBLIC_APP_URL = "https://beautonomi.com";
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", email: "u@test.com" } });
    mockIsPaystackEnabledForTenant.mockResolvedValue(true);
    mockAssertReportingCurrencyReady.mockResolvedValue({ ok: true });
    mockResolveProductOrderPaystackAmount.mockResolvedValue({
      ok: true,
      amountSmallestUnit: 50000,
    });
    mockInitializeOnlinePayment.mockResolvedValue({
      provider: "paystack",
      authorizationUrl: "https://checkout.paystack.com/x",
      reference: "ref_123",
      accessCode: "code_1",
    });
  });

  afterEach(() => {
    if (prevAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
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
    expect(mockInitializeOnlinePayment).toHaveBeenCalledTimes(1);
    const arg = mockInitializeOnlinePayment.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.currency).toBe("ZAR");
    expect(String(arg.callbackUrl ?? arg.callback_url)).toMatch(/^https:\/\//);
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
    const arg = mockInitializeOnlinePayment.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.channels).toEqual(["card"]);
  });

  // F-07: free-form `amount` (no booking / product order) must be bounded and
  // an integer number of minor units.
  it("rejects an absurdly large free-form amount with 400 and never calls the gateway", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/paystack/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: "u@test.com",
        amount: 1_000_000_000_000,
        metadata: { type: "wallet_topup" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockInitializeOnlinePayment).not.toHaveBeenCalled();
  });

  it("rejects a non-integer free-form minor-unit amount", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/paystack/initialize", {
      method: "POST",
      body: JSON.stringify({ email: "u@test.com", amount: 1050.5 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockInitializeOnlinePayment).not.toHaveBeenCalled();
  });
});
