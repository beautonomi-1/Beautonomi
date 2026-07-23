import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockCancelStale = vi.fn();
const mockRollback = vi.fn();
const mockRecordPayment = vi.fn();
const mockLookupIdempotency = vi.fn();
const mockRememberIdempotency = vi.fn();

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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/subscriptions/entitlements", () => ({
  getPaymentFeatureFlagsForTenant: vi.fn(async () => ({
    payment_paystack: true,
    payment_wallet: true,
  })),
}));

vi.mock("@/lib/payments/platform-payment-types", () => ({
  getPlatformPaymentTypesForTenant: vi.fn(async () => ({ cash: true })),
}));

vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  cancelStalePendingPaystackProductOrders: (...args: unknown[]) => mockCancelStale(...args),
  rollbackFailedProductOrderCheckout: (...args: unknown[]) => mockRollback(...args),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecordPayment(...args),
}));

vi.mock("@/lib/notifications/notify-product-order-paid", () => ({
  notifyProductOrderPaidIfTransitioned: vi.fn(async () => undefined),
  notifyProductOrderPlacedPendingPayment: vi.fn(async () => undefined),
}));

vi.mock("@/lib/http/idempotency", () => ({
  extractIdempotencyKey: vi.fn(() => null),
  lookupIdempotentResponse: (...args: unknown[]) => mockLookupIdempotency(...args),
  rememberIdempotentResponse: (...args: unknown[]) => mockRememberIdempotency(...args),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: vi.fn(async () => ({ data: { settings: { payouts: {} } } })),
}));

const providerId = "22222222-2222-4222-8222-222222222222";
const collectionLocationId = "33333333-3333-4333-8333-333333333333";

function buildHappyPathSupabase(opts?: { failItemsInsert?: boolean }) {
  const cartItem = {
    id: "cart-1",
    quantity: 1,
    product_variant_id: null,
    product: {
      id: "prod-1",
      name: "Shampoo",
      retail_price: "100.00",
      quantity: 10,
      is_active: true,
      retail_sales_enabled: true,
      track_stock_quantity: true,
      image_urls: [],
      tax_rate: "0",
      provider_id: providerId,
      has_variants: false,
      weight_grams: 100,
    },
    product_variant: null,
  };

  return {
    rpc: vi.fn(async (name: string) => {
      if (name === "nextval") return { data: 42, error: null };
      if (name === "decrement_product_stock") return { data: null, error: null };
      if (name === "wallet_debit_self") return { data: true, error: null };
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { tenant_id: "tenant-za" }, error: null })),
            })),
          })),
        };
      }
      if (table === "cart_items") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.delete = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }));
        chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [cartItem], error: null }).then(resolve);
        return chain;
      }
      if (table === "user_wallets") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: "w-1", balance: 200, currency: "ZAR" }, error: null })),
            })),
          })),
        };
      }
      if (table === "product_orders") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "order-1",
                  order_number: "BO-42",
                  payment_status: "pending",
                },
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      if (table === "product_order_items") {
        return {
          insert: vi.fn(async () => ({
            error: opts?.failItemsInsert ? { message: "items insert failed" } : null,
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("POST /api/me/orders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetSupabaseAdmin.mockReturnValue({});
    mockCancelStale.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRecordPayment.mockResolvedValue({ ok: true, duplicate: false, transitionedToPaid: true });
    mockLookupIdempotency.mockResolvedValue(null);
    mockRememberIdempotency.mockResolvedValue(undefined);
  });

  it("rejects creating order for provider outside active tenant", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "customer" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { tenant_id: "tenant-uk" },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/orders", {
      method: "POST",
      body: JSON.stringify({
        provider_id: providerId,
        fulfillment_type: "collection",
        collection_location_id: collectionLocationId,
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body?.error?.code).toBe("TENANT_MISMATCH");
  }, 45_000);

  it("rolls back wallet checkout when items insert fails after debit", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "customer" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetSupabaseServer.mockResolvedValue(buildHappyPathSupabase({ failItemsInsert: true }));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/orders", {
      method: "POST",
      body: JSON.stringify({
        provider_id: providerId,
        fulfillment_type: "collection",
        collection_location_id: collectionLocationId,
        payment_method: "paystack",
        use_wallet: true,
      }),
    });
    const res = await POST(req);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockRecordPayment).not.toHaveBeenCalled();
  }, 45_000);
});

/**
 * FND-P0-003 (REM-007) — Multi-market tenant isolation, runtime behavioural proof.
 *
 * Drives the REAL `GET /api/me/orders` handler against a filtering in-memory
 * Supabase fake seeded with TWO tenants' data. Proves the handler only surfaces
 * orders whose provider belongs to the host-resolved tenant — a cross-tenant
 * order (same customer, provider in another market) must never leak.
 *
 * This is stronger than a resolver-level mock: the fake honours the tenant
 * filters (`providers.tenant_id`, `product_orders.provider_id IN (...)`) exactly
 * as Postgres would, so the assertion fails if the route drops either scope.
 */
describe("GET /api/me/orders — cross-tenant isolation", () => {
  const TENANT_A = "tenant-za";
  const TENANT_B = "tenant-uk";
  const PROVIDER_A = "prov-a-0000-0000-0000-000000000001";
  const PROVIDER_B = "prov-b-0000-0000-0000-000000000002";

  // Same customer places an order in each market; only the host tenant's order
  // is theirs to see from a tenant-A host.
  const ALL_ORDERS = [
    { id: "order-A", provider_id: PROVIDER_A, customer_id: "user-1", tenant_id: TENANT_A },
    { id: "order-B", provider_id: PROVIDER_B, customer_id: "user-1", tenant_id: TENANT_B },
  ];
  const PROVIDERS_BY_TENANT: Record<string, string[]> = {
    [TENANT_A]: [PROVIDER_A],
    [TENANT_B]: [PROVIDER_B],
  };

  function buildIsolationSupabase(capture: { providerFilter: string[] | null }) {
    return {
      from: vi.fn((table: string) => {
        if (table === "providers") {
          // .select("id").eq("tenant_id", tenantId) → resolves to that tenant's providers
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, tenantId: string) => {
                const ids = PROVIDERS_BY_TENANT[tenantId] ?? [];
                return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
              }),
            })),
          };
        }
        if (table === "product_orders") {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn(() => chain);
          chain.eq = vi.fn(() => chain);
          chain.in = vi.fn((col: string, vals: string[]) => {
            if (col === "provider_id") capture.providerFilter = vals;
            return chain;
          });
          chain.order = vi.fn(() => chain);
          chain.range = vi.fn(() => chain);
          // Terminal await → apply the captured provider scope like Postgres would.
          chain.then = (resolve: (v: unknown) => unknown) => {
            const filter = capture.providerFilter ?? [];
            const rows = ALL_ORDERS.filter((o) => filter.includes(o.provider_id));
            return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
          };
          return chain;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns only the host tenant's orders and never a foreign-tenant order", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue(TENANT_A);
    const capture: { providerFilter: string[] | null } = { providerFilter: null };
    mockGetSupabaseServer.mockResolvedValue(buildIsolationSupabase(capture));

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://www.beautonomi.co.za/api/me/orders"));
    const body = await res.json();

    expect(res.status).toBe(200);
    const returnedIds = (body.data.orders as Array<{ id: string }>).map((o) => o.id);
    expect(returnedIds).toEqual(["order-A"]);
    expect(returnedIds).not.toContain("order-B");
    // The query must have been scoped to tenant-A providers only.
    expect(capture.providerFilter).toEqual([PROVIDER_A]);
    expect(capture.providerFilter).not.toContain(PROVIDER_B);
  });

  it("returns an empty list (never all orders) when the host tenant has no providers", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-unknown");
    const capture: { providerFilter: string[] | null } = { providerFilter: null };
    mockGetSupabaseServer.mockResolvedValue(buildIsolationSupabase(capture));

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("https://unknown.beautonomi.io/api/me/orders"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.orders).toEqual([]);
    // Fails closed: no provider scope means the route short-circuits, it does NOT
    // fall through to an unscoped product_orders read.
    expect(capture.providerFilter).toBeNull();
  });
});
