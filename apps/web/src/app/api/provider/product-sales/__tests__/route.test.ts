import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockRecordProductOrderPayment = vi.fn();

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

const mockGetTenantRegionConfig = vi.fn();
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

vi.mock("@/lib/provider-sales/pos-product-stock", () => ({
  validatePosProductStock: vi.fn().mockResolvedValue(null),
  applyPosProductStockDecrements: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecordProductOrderPayment(...args),
}));

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

const { mockHasProviderActivity } = vi.hoisted(() => ({
  mockHasProviderActivity: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/provider/client-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider/client-access")>();
  return {
    ...actual,
    hasProviderCustomerActivityRelationship: (...args: unknown[]) => mockHasProviderActivity(...args),
  };
});

const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function buildWalkInSupabase(opts: { providerTenantId: string | null }) {
  const insertCalls: unknown[] = [];

  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { tenant_id: opts.providerTenantId },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "products") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [
                  {
                    id: PRODUCT_ID,
                    name: "Test product",
                    retail_price: "100.00",
                    quantity: 50,
                    image_urls: [] as string[],
                    tax_rate: "15",
                    provider_id: PROVIDER_ID,
                    is_active: true,
                    retail_sales_enabled: true,
                    has_variants: false,
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "product_orders") {
        return {
          insert: vi.fn((payload: unknown) => {
            insertCalls.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "order-uuid-1",
                    ...(payload as Record<string, unknown>),
                  },
                  error: null,
                })),
              })),
            };
          }),
        };
      }
      if (table === "product_order_items") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }
      if (table === "provider_clients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: 42, error: null })),
  };

  return { mockSupabase, insertCalls };
}

describe("POST /api/provider/product-sales", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: USER_ID, role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockRecordProductOrderPayment.mockResolvedValue({ ok: true, duplicate: false });
    mockGetTenantRegionConfig.mockResolvedValue({
      tenantId: "tenant-from-provider-row",
      defaultCurrency: "ZAR",
    });
    mockGetSupabaseAdmin.mockReturnValue({});
    mockHasProviderActivity.mockReset();
    mockHasProviderActivity.mockResolvedValue(false);
  });

  it("sets tenant_id from providers.tenant_id when present", async () => {
    const tenantFromRow = "tenant-from-provider-row";
    const { mockSupabase, insertCalls } = buildWalkInSupabase({
      providerTenantId: tenantFromRow,
    });
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/product-sales", {
      method: "POST",
      body: JSON.stringify({
        items: [{ product_id: PRODUCT_ID, quantity: 1 }],
        payment_method: "cash",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body?.data?.order?.id).toBe("order-uuid-1");
    expect(insertCalls).toHaveLength(1);
    expect((insertCalls[0] as { tenant_id?: string }).tenant_id).toBe(tenantFromRow);
    expect(mockRecordProductOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        productOrderId: "order-uuid-1",
        source: "walk_in_pos",
        provider: "cash",
        platformHeld: false,
      }),
    );
    expect(mockResolveTenantIdWithZaFallback).not.toHaveBeenCalled();
  }, 45_000);

  it("falls back to resolveTenantIdWithZaFallback when provider tenant_id is null", async () => {
    const fallbackTenant = "tenant-fallback-za";
    mockResolveTenantIdWithZaFallback.mockResolvedValue(fallbackTenant);
    const { mockSupabase, insertCalls } = buildWalkInSupabase({
      providerTenantId: null,
    });
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/product-sales", {
      method: "POST",
      body: JSON.stringify({
        items: [{ product_id: PRODUCT_ID, quantity: 1 }],
        payment_method: "cash",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect((insertCalls[0] as { tenant_id?: string }).tenant_id).toBe(fallbackTenant);
    expect(mockResolveTenantIdWithZaFallback).toHaveBeenCalledTimes(1);
  }, 45_000);

  it("persists customer_id when walk-in customer name creates CRM link (users + provider_clients)", async () => {
    const newCustomerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: { success: true, user_id: newCustomerId }, error: null }),
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === "provider_clients") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(async () => ({ error: null })),
          };
        }
        if (table === "user_wallets") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null, data: null })),
            })),
          };
        }
        return {};
      }),
    });

    const tenantFromRow = "tenant-from-provider-row";
    const { mockSupabase, insertCalls } = buildWalkInSupabase({
      providerTenantId: tenantFromRow,
    });
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/product-sales", {
      method: "POST",
      body: JSON.stringify({
        items: [{ product_id: PRODUCT_ID, quantity: 1 }],
        payment_method: "cash",
        customer_name: "Walk-in Jane",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect((insertCalls[0] as { customer_id?: string | null }).customer_id).toBe(newCustomerId);
  }, 45_000);

  it("returns 400 when customer_id is set but client is not saved and there is no prior activity", async () => {
    const orphanCustomerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    mockHasProviderActivity.mockResolvedValue(false);
    const { mockSupabase } = buildWalkInSupabase({
      providerTenantId: "tenant-from-provider-row",
    });
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/product-sales", {
      method: "POST",
      body: JSON.stringify({
        items: [{ product_id: PRODUCT_ID, quantity: 1 }],
        payment_method: "cash",
        customer_id: orphanCustomerId,
      }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body?.error?.message).toMatch(/saved client list/i);
    expect(mockHasProviderActivity).toHaveBeenCalledWith(
      expect.anything(),
      PROVIDER_ID,
      orphanCustomerId,
    );
  }, 45_000);

  it("auto-links customer_id when provider_clients row is missing but activity exists", async () => {
    const linkedCustomerId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    mockHasProviderActivity.mockResolvedValue(true);
    const pcInsert = vi.fn(async () => ({ error: null }));
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_clients") {
          return { insert: pcInsert };
        }
        return {};
      }),
    });

    const { mockSupabase, insertCalls } = buildWalkInSupabase({
      providerTenantId: "tenant-from-provider-row",
    });
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/product-sales", {
      method: "POST",
      body: JSON.stringify({
        items: [{ product_id: PRODUCT_ID, quantity: 1 }],
        payment_method: "cash",
        customer_id: linkedCustomerId,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(pcInsert).toHaveBeenCalledTimes(1);
    expect((insertCalls[0] as { customer_id?: string | null }).customer_id).toBe(linkedCustomerId);
  }, 45_000);
});
