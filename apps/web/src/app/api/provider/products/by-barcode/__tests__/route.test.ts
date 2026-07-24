import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();

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

const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type ProductRow = Record<string, unknown>;
type VariantRow = Record<string, unknown>;

interface MockDb {
  products: ProductRow[];
  variants: VariantRow[];
}

function makeChain(table: string, db: MockDb) {
  const state: {
    filters: Record<string, unknown>;
    inFilters: Record<string, unknown[]>;
  } = { filters: {}, inFilters: {} };

  const applyFilters = (rows: Record<string, unknown>[]) =>
    rows.filter((row) =>
      Object.entries(state.filters).every(([key, value]) => row[key] === value),
    );

  const chain: any = {
    select: () => chain,
    eq: (col: string, value: unknown) => {
      state.filters[col] = value;
      return chain;
    },
    in: (col: string, values: unknown[]) => {
      state.inFilters[col] = values;
      return chain;
    },
    maybeSingle: async () => {
      const rows = applyFilters(table === "products" ? db.products : db.variants);
      return { data: rows[0] ?? null, error: null };
    },
    then: (resolve: (v: unknown) => void) => {
      const rows = applyFilters(table === "products" ? db.products : db.variants);
      resolve({ data: rows, error: null });
    },
  };
  return chain;
}

function makeSupabase(db: MockDb) {
  return {
    from: (table: string) => makeChain(table, db),
  };
}

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/provider/products/by-barcode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: USER_ID } });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
  });

  it("returns 400 when barcode and sku are missing", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeSupabase({ products: [], variants: [] }));
    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns simple product hit by barcode", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        products: [
          {
            id: PRODUCT_ID,
            name: "Shampoo",
            barcode: "1234567890123",
            sku: "SH-1",
            quantity: 10,
            retail_price: "99.00",
            image_urls: [],
            has_variants: false,
            retail_sales_enabled: true,
            track_stock_quantity: true,
            provider_id: PROVIDER_ID,
            is_active: true,
          },
        ],
        variants: [],
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode?barcode=1234567890123"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.product.id).toBe(PRODUCT_ID);
    expect(body.data.needs_variant).toBe(false);
    expect(body.data.variant).toBeUndefined();
  });

  it("returns variant hit with needs_variant false", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        products: [
          {
            id: PRODUCT_ID,
            name: "Oil",
            barcode: null,
            sku: null,
            quantity: 0,
            retail_price: "50.00",
            image_urls: [],
            has_variants: true,
            retail_sales_enabled: true,
            track_stock_quantity: true,
            provider_id: PROVIDER_ID,
            is_active: true,
          },
        ],
        variants: [
          {
            id: VARIANT_ID,
            product_id: PRODUCT_ID,
            barcode: "9998887776665",
            sku: "OIL-S",
            quantity: 4,
            retail_price: "55.00",
            option_values: { Size: "Small" },
          },
        ],
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode?barcode=9998887776665"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.variant?.id).toBe(VARIANT_ID);
    expect(body.data.needs_variant).toBe(false);
  });

  it("returns needs_variant and variants when parent barcode matches variant product without variant barcode", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        products: [
          {
            id: PRODUCT_ID,
            name: "Toner",
            barcode: "PARENT123",
            sku: "TN",
            quantity: 0,
            retail_price: "80.00",
            image_urls: [],
            has_variants: true,
            retail_sales_enabled: true,
            track_stock_quantity: true,
            provider_id: PROVIDER_ID,
            is_active: true,
          },
        ],
        variants: [
          {
            id: VARIANT_ID,
            product_id: PRODUCT_ID,
            barcode: "VAR-A",
            sku: "TN-A",
            quantity: 2,
            retail_price: "85.00",
            option_values: { Shade: "A" },
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            product_id: PRODUCT_ID,
            barcode: "VAR-B",
            sku: "TN-B",
            quantity: 3,
            retail_price: "86.00",
            option_values: { Shade: "B" },
          },
        ],
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode?barcode=PARENT123"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.needs_variant).toBe(true);
    expect(body.data.variants).toHaveLength(2);
    expect(body.data.variant).toBeUndefined();
  });

  it("returns NOT_FOR_RETAIL when retail sales disabled", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        products: [
          {
            id: PRODUCT_ID,
            name: "Internal use",
            barcode: "INTERNAL1",
            sku: null,
            quantity: 5,
            retail_price: "10.00",
            image_urls: [],
            has_variants: false,
            retail_sales_enabled: false,
            track_stock_quantity: true,
            provider_id: PROVIDER_ID,
            is_active: true,
          },
        ],
        variants: [],
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode?barcode=INTERNAL1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOR_RETAIL");
  });

  it("returns AMBIGUOUS_BARCODE when multiple products share barcode", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        products: [
          {
            id: PRODUCT_ID,
            name: "A",
            barcode: "DUP",
            sku: null,
            quantity: 1,
            retail_price: "10.00",
            image_urls: [],
            has_variants: false,
            retail_sales_enabled: true,
            track_stock_quantity: true,
            provider_id: PROVIDER_ID,
            is_active: true,
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "B",
            barcode: "DUP",
            sku: null,
            quantity: 1,
            retail_price: "12.00",
            image_urls: [],
            has_variants: false,
            retail_sales_enabled: true,
            track_stock_quantity: true,
            provider_id: PROVIDER_ID,
            is_active: true,
          },
        ],
        variants: [],
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode?barcode=DUP"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("AMBIGUOUS_BARCODE");
  });

  it("returns 404 when nothing matches", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeSupabase({ products: [], variants: [] }));
    const { GET } = await import("../route");
    const res = await GET(req("/api/provider/products/by-barcode?barcode=MISSING"));
    expect(res.status).toBe(404);
  });
});
