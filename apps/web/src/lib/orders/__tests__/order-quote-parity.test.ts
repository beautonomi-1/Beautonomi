import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOnlineProductOrderCheckout } from "../product-order-online-checkout";

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
  lineVatRatePercent: vi.fn(() => 15),
}));

import { computeProductOrderTotals } from "../compute-product-order-totals";

const cartItems = [
  {
    quantity: 1,
    product: {
      id: "p1",
      name: "Oil",
      retail_price: "50",
      tax_rate: "15",
      image_urls: [],
      weight_grams: 100,
    },
    product_variant: null,
  },
];

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

describe("POST /api/me/orders quote vs create parity", () => {
  beforeEach(() => {
    deliveryQuote.mockReset();
    applyPromo.mockReset();
  });

  it("matches totals when quote online_checkout aligns with order payment_method", async () => {
    const base = {
      cartItems,
      providerId: "prov-1",
      tenantId: "tenant-1",
      customerId: "user-1",
      fulfillmentType: "collection" as const,
    };

    const quoteTotals = await computeProductOrderTotals(supabaseStub(), {
      ...base,
      onlineCheckout: true,
    });
    const orderTotals = await computeProductOrderTotals(supabaseStub(), {
      ...base,
      onlineCheckout: isOnlineProductOrderCheckout("paystack"),
    });

    expect(quoteTotals.ok && orderTotals.ok).toBe(true);
    if (!quoteTotals.ok || !orderTotals.ok) return;
    expect(orderTotals.totals).toEqual(quoteTotals.totals);
  });

  it("matches in-person tender when quote passes online_checkout false and order uses cash", async () => {
    const base = {
      cartItems,
      providerId: "prov-1",
      tenantId: "tenant-1",
      customerId: "user-1",
      fulfillmentType: "collection" as const,
    };

    const quoteTotals = await computeProductOrderTotals(supabaseStub(), {
      ...base,
      onlineCheckout: false,
    });
    const orderTotals = await computeProductOrderTotals(supabaseStub(), {
      ...base,
      onlineCheckout: isOnlineProductOrderCheckout("cash"),
    });

    expect(quoteTotals.ok && orderTotals.ok).toBe(true);
    if (!quoteTotals.ok || !orderTotals.ok) return;
    expect(orderTotals.totals.totalAmount).toBe(quoteTotals.totals.totalAmount);
    expect(orderTotals.totals.platformFee).toBe(0);
  });
});
