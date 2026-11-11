import { describe, it, expect, vi, beforeEach } from "vitest";

const deliveryQuote = vi.fn();
const applyPromo = vi.fn();

vi.mock("@/lib/orders/product-order-delivery-quote", () => ({
  computeProductOrderDeliveryQuote: (...args: unknown[]) => deliveryQuote(...args),
}));
vi.mock("@/lib/ecommerce/product-order-promotion", () => ({
  applyProductOrderPromotion: (...args: unknown[]) => applyPromo(...args),
}));
vi.mock("@/lib/platform-service-fee-settings", () => ({
  getEffectivePlatformFeeConfig: vi.fn(),
  calculatePlatformFeeAmount: vi.fn(),
}));
vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: vi.fn(async () => ({
    data: { settings: { payouts: { platform_service_fee_type: "fixed", platform_service_fee_fixed: 5 } } },
  })),
}));
vi.mock("@/lib/tax/resolve-provider-vat", () => ({
  resolveProviderVat: vi.fn(async () => ({
    registered: true,
    ratePercent: 15,
    inclusive: false,
    vatNumber: "4123456789",
    source: "provider",
  })),
  lineVatRatePercent: vi.fn((_vat: { ratePercent: number }) => 15),
}));

import {
  collectProductOrderStockIssues,
  computeProductOrderTotals,
} from "../compute-product-order-totals";

function supabaseStub() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              customer_fee_config_id: null,
              currency: "ZAR",
              is_vat_registered: true,
              tax_rate_percent: 15,
              tax_inclusive: false,
            },
          }),
        }),
      }),
    }),
  } as any;
}

const cartItems = [
  {
    quantity: 2,
    product: { id: "p1", name: "Serum", retail_price: "100", tax_rate: "15", image_urls: ["a.jpg"], weight_grams: 200 },
    product_variant: null,
  },
];

const baseInput = {
  cartItems,
  providerId: "prov-1",
  tenantId: "tenant-1",
  customerId: "user-1",
  fulfillmentType: "collection" as const,
};

describe("computeProductOrderTotals", () => {
  beforeEach(() => {
    deliveryQuote.mockReset();
    applyPromo.mockReset();
  });

  it("sums subtotal, tax and online platform fee", async () => {
    const res = await computeProductOrderTotals(supabaseStub(), baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totals.subtotal).toBe(200);
    expect(res.totals.taxAmount).toBe(30);
    expect(res.totals.platformFee).toBe(5);
    expect(res.totals.totalAmount).toBe(235);
    expect(res.totals.items[0]).toMatchObject({ product_id: "p1", unit_price: 100, total_price: 200 });
  });

  it("returns the provider VAT snapshot so the order row can persist it (F2-39)", async () => {
    const res = await computeProductOrderTotals(supabaseStub(), baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totals.taxInclusive).toBe(false);
    expect(res.totals.providerVatNumber).toBe("4123456789");
  });

  it("omits platform fee for in-person tender", async () => {
    const res = await computeProductOrderTotals(supabaseStub(), { ...baseInput, onlineCheckout: false });
    expect(res.ok && res.totals.platformFee).toBe(0);
    expect(res.ok && res.totals.totalAmount).toBe(230);
  });

  it("passes customer and cart to the delivery quote and returns fee metadata", async () => {
    deliveryQuote.mockResolvedValue({ ok: true, quote: { fee: 40, feeType: "distance", distanceKm: 7.5 } });
    const res = await computeProductOrderTotals(supabaseStub(), {
      ...baseInput,
      fulfillmentType: "delivery",
      deliveryAddressId: "addr-1",
    });
    expect(deliveryQuote).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", providerId: "prov-1", deliveryAddressId: "addr-1", cartItems }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totals.deliveryFee).toBe(40);
    expect(res.totals.deliveryFeeType).toBe("distance");
    expect(res.totals.deliveryDistanceKm).toBe(7.5);
    expect(res.totals.totalAmount).toBe(275);
  });

  it("maps delivery quote failures to a readable message", async () => {
    deliveryQuote.mockResolvedValue({ ok: false, code: "DELIVERY_RADIUS_EXCEEDED" });
    const res = await computeProductOrderTotals(supabaseStub(), {
      ...baseInput,
      fulfillmentType: "delivery",
      deliveryAddressId: "addr-1",
    });
    expect(res).toEqual({
      ok: false,
      code: "DELIVERY_RADIUS_EXCEEDED",
      message: "Delivery address is outside this provider's delivery radius.",
    });
  });

  it("applies promotion before tax and returns promotion identity", async () => {
    applyPromo.mockResolvedValue({ ok: true, promotionId: "promo-1", code: "SAVE50", discountAmount: 50 });
    const res = await computeProductOrderTotals(supabaseStub(), { ...baseInput, promotionCode: "save50" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totals.promotionDiscount).toBe(50);
    expect(res.totals.discountedSubtotal).toBe(150);
    expect(res.totals.taxAmount).toBe(22.5);
    expect(res.totals.promotionId).toBe("promo-1");
    expect(res.totals.promotionCode).toBe("SAVE50");
    expect(res.totals.totalAmount).toBe(177.5);
  });

  it("rejects an invalid promotion", async () => {
    applyPromo.mockResolvedValue({ ok: false, message: "Code expired" });
    const res = await computeProductOrderTotals(supabaseStub(), { ...baseInput, promotionCode: "OLD" });
    expect(res).toEqual({ ok: false, code: "PROMO_INVALID", message: "Code expired" });
  });

  it("charges no tax when provider is not VAT registered", async () => {
    const { resolveProviderVat, lineVatRatePercent } = await import("@/lib/tax/resolve-provider-vat");
    vi.mocked(resolveProviderVat).mockResolvedValueOnce({
      registered: false,
      ratePercent: 0,
      inclusive: true,
      vatNumber: null,
      source: "none",
    });
    vi.mocked(lineVatRatePercent).mockReturnValueOnce(0);
    const res = await computeProductOrderTotals(supabaseStub(), baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totals.taxAmount).toBe(0);
    expect(res.totals.totalAmount).toBe(205);
  });
});

describe("collectProductOrderStockIssues", () => {
  const product = { name: "Serum", is_active: true, retail_sales_enabled: true, quantity: 2 };

  it("returns no issues when every line is available", () => {
    expect(collectProductOrderStockIssues([{ quantity: 2, product }])).toEqual([]);
  });

  it("reports inactive products, missing variants and short stock", () => {
    expect(
      collectProductOrderStockIssues([
        { quantity: 1, product: { ...product, name: "Old", is_active: false } },
        { quantity: 1, product: { ...product, name: "Kit", has_variants: true }, product_variant: null },
        { quantity: 3, product },
        { quantity: 3, product: { ...product, name: "Untracked", track_stock_quantity: false } },
        { quantity: 4, product, product_variant: { quantity: 5 } },
      ]),
    ).toEqual([
      "Old is no longer available",
      "Kit: variant required",
      "Serum: only 2 available (requested 3)",
    ]);
  });
});
