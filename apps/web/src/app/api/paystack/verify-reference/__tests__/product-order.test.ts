import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockOptionalAuthInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetPaystackSecretKey = vi.fn();
const mockRecordProductOrderPayment = vi.fn();
let adminOrderRow: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    optionalAuthInApi: (...args: unknown[]) => mockOptionalAuthInApi(...args),
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

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-za"),
}));

vi.mock("@/lib/money/tenant-intl-format", () => ({
  getTenantMoneyFormatter: vi.fn(async () => ({ format: (value: number) => `R${value.toFixed(2)}` })),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecordProductOrderPayment(...args),
}));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  processSuccessfulPayment: vi.fn(),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/notify-provider-team", () => ({
  notifyProviderTeamUsers: vi.fn(async () => undefined),
}));

function productOrdersQuery(row: Record<string, unknown> | null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      })),
    })),
  };
}

function mockSupabase(orderRow: Record<string, unknown> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "product_orders") throw new Error(`Unexpected table ${table}`);
      return productOrdersQuery(orderRow);
    }),
  };
}

function adminSupabase() {
  return mockSupabase(adminOrderRow);
}

describe("GET /api/paystack/verify-reference product orders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockOptionalAuthInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetPaystackSecretKey.mockResolvedValue("sk_test");
    mockRecordProductOrderPayment.mockResolvedValue({ ok: true, duplicate: false });
    adminOrderRow = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            status: "success",
            amount: 10_000,
            fees: 200,
            currency: "ZAR",
            reference: "ref-1",
            metadata: { product_order_id: "order-1" },
          },
        }),
      })),
    );
  });

  it("fulfills a verified product order reference", async () => {
    const orderRow = {
      id: "order-1",
      tenant_id: "tenant-za",
      provider_id: "provider-1",
      customer_id: "customer-1",
      total_amount: 120,
      wallet_amount: 20,
      payment_status: "pending",
      payment_reference: null,
      order_number: "BO-1",
    };
    mockGetSupabaseServer.mockResolvedValue(mockSupabase(orderRow));
    adminOrderRow = orderRow;
    mockGetSupabaseAdmin.mockReturnValue(adminSupabase());

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/paystack/verify-reference?reference=ref-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.verified).toBe(true);
    expect(body?.data?.type).toBe("product_order");
    expect(mockRecordProductOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        productOrderId: "order-1",
        reference: "ref-1",
        amountMajor: 100,
        feesMajor: 2,
        provider: "paystack",
      }),
    );
  });

  it("does not fulfill a product order for another customer", async () => {
    const row = {
      id: "order-1",
      tenant_id: "tenant-za",
      provider_id: "provider-1",
      customer_id: "customer-2",
      total_amount: 100,
      wallet_amount: 0,
      payment_status: "pending",
      payment_reference: null,
    };
    mockGetSupabaseServer.mockResolvedValue(mockSupabase(row));
    adminOrderRow = row;
    mockGetSupabaseAdmin.mockReturnValue(adminSupabase());

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/paystack/verify-reference?reference=ref-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body?.error?.code).toBe("FORBIDDEN");
    expect(mockRecordProductOrderPayment).not.toHaveBeenCalled();
  });

  it("fulfills product order verification without session", async () => {
    mockOptionalAuthInApi.mockResolvedValue({ user: null });
    const orderRow = {
      id: "order-1",
      tenant_id: "tenant-za",
      provider_id: "provider-1",
      customer_id: "customer-2",
      total_amount: 100,
      wallet_amount: 0,
      payment_status: "pending",
      payment_reference: null,
      order_number: "BO-1",
    };
    mockGetSupabaseServer.mockResolvedValue(mockSupabase(orderRow));
    adminOrderRow = orderRow;
    mockGetSupabaseAdmin.mockReturnValue(adminSupabase());

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/paystack/verify-reference?reference=ref-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.verified).toBe(true);
    expect(mockRecordProductOrderPayment).toHaveBeenCalledTimes(1);
  });
});
